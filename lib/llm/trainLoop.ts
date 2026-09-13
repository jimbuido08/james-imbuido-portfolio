/**
 * The training loop — seeded batch sampling, forward → backward → clip →
 * Adam, progress callbacks, and cooperative cancellation. Runs identically in
 * the browser worker and in the offline tsx trainer (the cancel/yield seams
 * are injectable; defaults use setTimeout(0), which exists in both).
 *
 * Determinism contract: three substreams derive from the caller's seed —
 * init = mulberry32(seed), batch sampling = mulberry32(seed ^ BATCH_SEED_XOR),
 * periodic eval sampling = mulberry32(EVAL_SEED) with a fixed prompt — so a
 * (config, corpus, seed, steps) run is fully reproducible. Documented in
 * docs/notes/llm-model-training.md; mirrored by the offline trainer simply by
 * using this same module.
 */
import { TRAINING_DEFAULTS, PRESETS } from "./config";
import type { Preset } from "./config";
import {
  createModel,
  createWorkspace,
  forward,
  generate,
  initWeights,
  BOS_BYTE,
} from "./model";
import type { Model } from "./model";
import { backward } from "./backward";
import { adamStep, createAdamState, gradNorm, lrAt, scaleGrads } from "./adam";
import { mulberry32 } from "./prng";
import { decodeBytes } from "./tokenizer";

/** Substream derivation XORs — part of the determinism contract. */
export const BATCH_SEED_XOR = 0x9e3779b9;
/** Fixed seed for the periodic mid-training samples (display only). */
export const EVAL_SEED = 0x5eed;
/** Tokens generated per mid-training sample. */
export const EVAL_SAMPLE_TOKENS = 32;

export interface TrainProgress {
  /** 1-based completed step. */
  step: number;
  totalSteps: number;
  /** Raw mean CE of this step (nats/byte). */
  loss: number;
  /** 0.9/0.1 EMA — what the UI plots. */
  lossEma: number;
  tokensPerSec: number;
  etaSeconds: number;
  /** Present on sample steps (see sampleEvery). */
  sample?: string;
}

export interface TrainResult {
  model: Model;
  /** Final EMA loss (nats/byte). */
  finalLoss: number;
  steps: number;
  cancelled: boolean;
  elapsedMs: number;
}

export interface TrainOptions {
  steps: number;
  seed: number;
  onProgress?: (p: TrainProgress) => void;
  /** Poll between steps; return true to stop after the current step. */
  isCancelled?: () => boolean;
  /** Override for tests; defaults to setTimeout(0) every 2 steps. */
  yieldNow?: () => Promise<void>;
  /** Steps between mid-training samples; 0 disables. Defaults to ⌊steps/5⌋. */
  sampleEvery?: number;
  /** Batch size override (the offline trainer uses a larger one). */
  batchSize?: number;
  /** Peak LR override. */
  peakLr?: number;
}

const defaultYield = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function trainModel(
  corpus: Uint8Array,
  preset: Preset,
  opts: TrainOptions,
): Promise<TrainResult> {
  const { config } = preset;
  const t = config.ctxLen;
  const batch = opts.batchSize ?? preset.batchSize;
  const steps = Math.max(1, Math.floor(opts.steps));
  if (corpus.length < t + 2)
    throw new Error(
      `This text is too short to train on — need at least ${t + 2} bytes, got ${corpus.length}.`,
    );

  const model = createModel(config);
  initWeights(model, opts.seed >>> 0);
  const ws = createWorkspace(config, batch, t, true);
  const adam = createAdamState(model.weights.length);
  const sampler = mulberry32((opts.seed ^ BATCH_SEED_XOR) >>> 0);
  const yieldNow = opts.yieldNow ?? defaultYield;
  const sampleEvery =
    opts.sampleEvery !== undefined
      ? opts.sampleEvery
      : Math.max(1, Math.floor(steps / 5));

  // Generation workspace is created lazily on the first sample step.
  let genWs: ReturnType<typeof createWorkspace> | null = null;
  const sampleText = (): string => {
    genWs ??= createWorkspace(config, 1, t, false);
    const ids = generate(model, genWs, Uint8Array.of(BOS_BYTE), {
      maxTokens: EVAL_SAMPLE_TOKENS,
      temperature: 0.8,
      seed: EVAL_SEED,
    });
    return decodeBytes(ids);
  };

  const ids = new Uint8Array(batch * t);
  const targets = new Uint8Array(batch * t);
  const maxOffset = corpus.length - t - 1;
  let lossEma: number | null = null;
  let lastLoss = NaN;
  let stepMsEma = 0;
  const started = performance.now();

  let step = 0;
  let cancelled = false;
  for (step = 1; step <= steps; step++) {
    const stepStart = performance.now();
    for (let b = 0; b < batch; b++) {
      const off = Math.floor(sampler() * maxOffset);
      for (let i = 0; i < t; i++) {
        ids[b * t + i] = corpus[off + i];
        targets[b * t + i] = corpus[off + i + 1];
      }
    }

    ws.grads!.fill(0);
    const loss = forward(model, ws, ids, targets)!;
    lastLoss = loss;
    backward(model, ws, ids, targets);

    const norm = gradNorm(ws.grads!);
    if (norm > TRAINING_DEFAULTS.gradClip)
      scaleGrads(ws.grads!, TRAINING_DEFAULTS.gradClip / norm);
    const lr = lrAt(
      step - 1,
      steps,
      opts.peakLr ?? TRAINING_DEFAULTS.peakLr,
      TRAINING_DEFAULTS.warmupFrac,
      TRAINING_DEFAULTS.finalLrFrac,
    );
    adamStep(
      model.weights,
      ws.grads!,
      adam,
      lr,
      step,
      TRAINING_DEFAULTS.beta1,
      TRAINING_DEFAULTS.beta2,
      TRAINING_DEFAULTS.eps,
    );

    const stepMs = performance.now() - stepStart;
    stepMsEma = stepMsEma === 0 ? stepMs : 0.8 * stepMsEma + 0.2 * stepMs;
    lossEma = lossEma === null ? loss : 0.9 * lossEma + 0.1 * loss;

    const progress: TrainProgress = {
      step,
      totalSteps: steps,
      loss,
      lossEma,
      tokensPerSec: (batch * t) / (stepMs / 1000),
      etaSeconds: ((steps - step) * stepMsEma) / 1000,
      sample:
        sampleEvery > 0 && step % sampleEvery === 0 ? sampleText() : undefined,
    };
    opts.onProgress?.(progress);

    // Let queued messages (cancelTrain) land, then honour cancellation.
    if (step % 2 === 0 || step === steps) await yieldNow();
    if (opts.isCancelled?.()) {
      cancelled = true; // partial weights stay in the model — generation still works
      break;
    }
  }

  return {
    model,
    finalLoss: lossEma ?? lastLoss,
    steps: cancelled ? step : steps,
    cancelled,
    elapsedMs: performance.now() - started,
  };
}

/** Convenience for callers that only have a preset key. */
export function presetByKey(key: keyof typeof PRESETS): Preset {
  return PRESETS[key];
}
