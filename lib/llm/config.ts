/**
 * Single source of truth for the LLM Lab model configuration — presets,
 * parameter-count formula, training hyperparameters, and the shipped sample
 * artifact identity. The browser worker, the offline tsx trainer
 * (training/llm/train_sample.ts), the fixture generator (reference.py mirrors
 * this file), and the verify gate (npm run verify:llm-model) all derive their
 * numbers from here. UI copy must read param counts/step defaults through
 * these constants — never hard-code them.
 *
 * Contract details and gate numbers: docs/notes/llm-model-training.md.
 */

export interface ModelConfig {
  /** Transformer width. */
  dModel: number;
  nLayer: number;
  /** dModel must be divisible by nHead. */
  nHead: number;
  /** Context length == training sequence length. */
  ctxLen: number;
  /** Byte-level: one token per UTF-8 byte, always 256. */
  vocabSize: number;
}

export const VOCAB_SIZE = 256;

/**
 * Parameter count for a pre-LN decoder-only transformer with a tied output
 * head (logits = hidden · wteᵀ, so no separate head matrix), biases on every
 * linear layer, and a GELU MLP with 4× hidden width:
 *
 *   block  = 12·d² + 13·d     (qkv 3d²+3d, proj d²+d, mlp 8d²+5d, 2·LN 4d)
 *   total  = vocab·d + ctx·d + L·block + 2·d   (final LN)
 *
 * Mirrored verbatim by reference.py — change both sides together.
 */
export function paramCount(c: ModelConfig): number {
  const d = c.dModel;
  return (
    c.vocabSize * d + c.ctxLen * d + c.nLayer * (12 * d * d + 13 * d) + 2 * d
  );
}

export interface Preset {
  key: PresetKey;
  label: string;
  /** One-line UI blurb. */
  blurb: string;
  config: ModelConfig;
  /** Sequences per optimizer step; tokens/step = batchSize · ctxLen. */
  batchSize: number;
  /**
   * Fallback step count when no calibration measurement is available, and the
   * ceiling reference for calibration scaling. Conservative until the probe
   * numbers land (training/llm/probe.ts); LLM-7 re-tunes from real timings.
   */
  defaultSteps: number;
}

export type PresetKey = "nano" | "small" | "mini";

export const PRESETS: Record<PresetKey, Preset> = {
  nano: {
    key: "nano",
    label: "Nano",
    blurb: "Fastest — the default on phones and data-saver connections.",
    config: {
      dModel: 64,
      nLayer: 2,
      nHead: 4,
      ctxLen: 64,
      vocabSize: VOCAB_SIZE,
    },
    batchSize: 8,
    defaultSteps: 180,
  },
  small: {
    key: "small",
    label: "Small",
    blurb: "The desktop default — same shape as the sample James trained.",
    config: {
      dModel: 96,
      nLayer: 4,
      nHead: 4,
      ctxLen: 96,
      vocabSize: VOCAB_SIZE,
    },
    batchSize: 6,
    defaultSteps: 60,
  },
  mini: {
    key: "mini",
    label: "Mini",
    blurb: "Biggest — for patient desktops only.",
    config: {
      dModel: 128,
      nLayer: 4,
      nHead: 4,
      ctxLen: 128,
      vocabSize: VOCAB_SIZE,
    },
    batchSize: 4,
    defaultSteps: 36,
  },
} as const;

/**
 * Fixture-only micro configuration (10,816 params) — small enough that the
 * full weight set, a forward pass, and one Adam step round-trip through JSON
 * fixtures and a numpy finite-difference check. Never offered in the UI.
 */
export const MICRO_CONFIG: ModelConfig = {
  dModel: 16,
  nLayer: 2,
  nHead: 2,
  ctxLen: 8,
  vocabSize: VOCAB_SIZE,
};
export const MICRO_BATCH_SIZE = 1;

export function assertValidConfig(c: ModelConfig): void {
  if (c.vocabSize !== VOCAB_SIZE)
    throw new Error(`vocabSize must be ${VOCAB_SIZE}`);
  if (c.dModel % c.nHead !== 0)
    throw new Error(`dModel ${c.dModel} not divisible by nHead ${c.nHead}`);
  if (c.ctxLen < 1 || c.nLayer < 1)
    throw new Error("ctxLen and nLayer must be ≥ 1");
}

/** Training hyperparameters shared by every preset (Adam + cosine LR). */
export const TRAINING_DEFAULTS = {
  peakLr: 3e-3,
  /** Fraction of total steps spent warming up linearly from 0. */
  warmupFrac: 0.05,
  /** End-of-decay LR as a fraction of the peak. */
  finalLrFrac: 0.1,
  beta1: 0.9,
  beta2: 0.99,
  eps: 1e-8,
  /** Global gradient-norm clip. */
  gradClip: 1.0,
} as const;

/**
 * Weight init policy (GPT-2 style): every weight matrix ~ N(0, INIT_STD),
 * except residual projections (attention out-proj, MLP down-proj) which use
 * INIT_STD / sqrt(2 · nLayer). Biases start at 0. The init stream is one
 * seeded PRNG filling tensors in the artifact's fixed weight order — mirrored
 * exactly by reference.py so fixtures are reproducible cross-language.
 */
export const INIT_STD = 0.02;

/**
 * Calibration: the worker measures matmul throughput (~100 ms) and scales the
 * default step count so training lands near TARGET_TRAIN_SECONDS on the
 * visitor's actual device. FLOPs/step ≈ 6 · params · tokens/step · OVERHEAD
 * (attention/softmax/GELU/optimizer not in the 6NT rule).
 */
export const TARGET_TRAIN_SECONDS = 60;
const FLOP_OVERHEAD = 1.15;
/** Step-count bounds for the calibration scaler AND the Configure card input. */
export const MIN_STEPS = 25;
export const MAX_STEPS = 400;

export function flopsPerStep(p: Preset): number {
  const tokens = p.batchSize * p.config.ctxLen;
  return 6 * paramCount(p.config) * tokens * FLOP_OVERHEAD;
}

/** Steps implied by a measured matmul rate in GFLOP/s, clamped to [25, 400]. */
export function calibrationToSteps(measuredGflops: number, p: Preset): number {
  if (!Number.isFinite(measuredGflops) || measuredGflops <= 0)
    return p.defaultSteps;
  const steps = Math.round(
    (TARGET_TRAIN_SECONDS * measuredGflops * 1e9) / flopsPerStep(p),
  );
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, steps));
}

/** The sample checkpoint James ships (LLM-5). Plain-git sized (~0.92 MiB fp16). */
export const SAMPLE_ARTIFACT_FILENAME = "llm-portfolio.bin";
export const SAMPLE_ARTIFACT_URL = `/models/llm/${SAMPLE_ARTIFACT_FILENAME}`;
export const LLM_MODEL_BASE = "/models/llm/";
