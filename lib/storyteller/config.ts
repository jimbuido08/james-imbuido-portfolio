/**
 * Single source of truth for the storyteller model's shape, URLs, and
 * generation bounds. The values mirror training/storyteller/reference.py and
 * the STOR container header; the gate (scripts/verify-storyteller-model.ts)
 * proves they agree with the shipped artifacts.
 */

export const STORYTELLER_MODEL_URL = "/models/storyteller/storyteller.bin";
export const STORYTELLER_TOKENIZER_URL = "/models/storyteller/tokenizer.json";

export const MODEL_BYTES = 13_834_784; // 32-B STOR header + 13,834,752-B fp16 payload
export const TOKENIZER_BYTES = 593_782;

export const EXPECTED_PARAMS = 6_917_376;

export interface StorytellerConfig {
  nLayer: number;
  nEmbd: number;
  nHead: number;
  ctxLen: number;
  vocabSize: number;
}

/** pc-tiny — the shipped model (training/storyteller/training_log.json run). */
export const STORYTELLER_CONFIG: StorytellerConfig = {
  nLayer: 6,
  nEmbd: 256,
  nHead: 8,
  ctxLen: 256,
  vocabSize: 8192,
};

/** SwiGLU hidden width — derived (int(d·8/3) rounded up to a 64 multiple), matching model.py. */
export function hiddenOf(nEmbd: number): number {
  return Math.floor((Math.trunc((nEmbd * 8) / 3) + 63) / 64) * 64;
}

/** params = vocab·d + L·(2d + 4d² + 3·d·hidden) + d — the tied head is counted once. */
export function storytellerParamCount(c: StorytellerConfig): number {
  const hidden = hiddenOf(c.nEmbd);
  const perLayer = 2 * c.nEmbd + 4 * c.nEmbd ** 2 + 3 * c.nEmbd * hidden;
  return c.vocabSize * c.nEmbd + c.nLayer * perLayer + c.nEmbd;
}

export function assertValidStorytellerConfig(c: StorytellerConfig): void {
  if (
    c.nEmbd % c.nHead !== 0 ||
    c.nLayer < 1 ||
    c.ctxLen < 2 ||
    c.vocabSize < 2
  ) {
    throw new Error("This model's shape settings are invalid.");
  }
  if (storytellerParamCount(c) !== EXPECTED_PARAMS) {
    throw new Error(
      `This model's shape doesn't match the shipped storyteller model (${storytellerParamCount(c).toLocaleString("en-US")} params).`,
    );
  }
}

// ---- generation bounds (mirrored by the page controls) ----

export const GEN_MIN_TOKENS = 64;
export const GEN_MAX_TOKENS = 400;
export const GEN_DEFAULT_TOKENS = 200;
export const GEN_MIN_TEMPERATURE = 0.5;
export const GEN_MAX_TEMPERATURE = 1.2;
export const GEN_DEFAULT_TEMPERATURE = 0.8;

export const TOP_K = 40;
export const TEMPERATURE_FLOOR = 1e-3;

// ---- numerics (mirror model.py / reference.py) ----

export const RMS_EPS = 1e-6;
export const ROPE_BASE = 10_000;

/** Human-sentence file sizes for the loading copy. */
export const MODEL_MB = "13.8 MB";
export const TOKENIZER_KB = "0.6 MB";
