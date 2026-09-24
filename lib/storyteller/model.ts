/**
 * The storyteller's forward pass and generation, hand-written over
 * Float32Array — no ML framework (the site's browser-inference ethos).
 *
 * One incremental path: `step()` processes a single token at position
 * `seqLen`, appends its ROPED K (and V) to the per-layer caches, and returns
 * that position's logits. A "full forward" is just step() across the sequence,
 * so prefill, generation, and the parity gate share identical arithmetic by
 * construction. Unlike the LLM Lab (where ctx ≤ 128 made recompute cheap),
 * this model is 6.9M params at ctx 256 — re-running the window per token
 * would cost ~3.5 GFLOP/token, so the KV cache is load-bearing. Past the
 * first window, generation rebuilds the cache from the last ctxLen ids —
 * the same sliding-window semantics as model.py's generate().
 */

import {
  hiddenOf,
  RMS_EPS,
  ROPE_BASE,
  StorytellerConfig,
  TEMPERATURE_FLOOR,
  TOP_K,
} from "./config";
import { StorytellerWeights } from "./container";
import { Rng } from "../llm/prng";

export interface StorytellerModel {
  config: StorytellerConfig;
  weights: StorytellerWeights;
  ropeCos: Float64Array; // [ctxLen × headDim/2]
  ropeSin: Float64Array;
  cacheK: Float32Array[]; // per layer: [ctxLen × nEmbd] — ROPED keys
  cacheV: Float32Array[]; // per layer: [ctxLen × nEmbd]
  seqLen: number;
  // Workspaces (allocated once — no per-token garbage):
  x: Float32Array;
  h: Float32Array;
  qkv: Float32Array;
  attn: Float32Array;
  gate: Float32Array;
  up: Float32Array;
  scores: Float64Array;
  logits: Float32Array;
}

export interface GenerateOptions {
  maxTokens: number;
  temperature: number;
  rng: Rng;
  topK?: number;
  greedy?: boolean;
  isCancelled?: () => boolean;
  onToken?: (id: number, tokensSoFar: number) => void;
  /**
   * Yield between tokens so the worker's message queue can drain (cancel
   * messages land). The gate and record_expectations omit it — an immediate
   * resolve keeps their runs deterministic and identical to the worker's:
   * the rng stream never depends on when we yield.
   */
  yieldNow?: () => Promise<void>;
}

export interface GenerateResult {
  ids: Uint16Array; // prompt + generated ids
  tokensGenerated: number;
  cancelled: boolean;
}

export function createStorytellerModel(decoded: {
  config: StorytellerConfig;
  weights: StorytellerWeights;
}): StorytellerModel {
  const { config, weights } = decoded;
  const headDim = config.nEmbd / config.nHead;
  const half = headDim / 2;
  const ropeCos = new Float64Array(config.ctxLen * half);
  const ropeSin = new Float64Array(config.ctxLen * half);
  for (let i = 0; i < half; i++) {
    const invFreq = 1 / Math.pow(ROPE_BASE, (2 * i) / headDim);
    for (let t = 0; t < config.ctxLen; t++) {
      ropeCos[t * half + i] = Math.cos(t * invFreq);
      ropeSin[t * half + i] = Math.sin(t * invFreq);
    }
  }
  return {
    config,
    weights,
    ropeCos,
    ropeSin,
    cacheK: Array.from(
      { length: config.nLayer },
      () => new Float32Array(config.ctxLen * config.nEmbd),
    ),
    cacheV: Array.from(
      { length: config.nLayer },
      () => new Float32Array(config.ctxLen * config.nEmbd),
    ),
    seqLen: 0,
    x: new Float32Array(config.nEmbd),
    h: new Float32Array(config.nEmbd),
    qkv: new Float32Array(3 * config.nEmbd),
    attn: new Float32Array(config.nEmbd),
    gate: new Float32Array(hiddenOf(config.nEmbd)),
    up: new Float32Array(hiddenOf(config.nEmbd)),
    scores: new Float64Array(config.ctxLen),
    logits: new Float32Array(config.vocabSize),
  };
}

export function resetStoryteller(model: StorytellerModel): void {
  model.seqLen = 0; // caches are overwritten lazily as positions refill
}

/** rmsnorm one row: out = x · rsqrt(mean(x²) + eps) · w */
function rmsnormRow(
  out: Float32Array,
  x: Float32Array,
  w: Float32Array,
  d: number,
): void {
  let sumSq = 0;
  for (let k = 0; k < d; k++) sumSq += x[k] * x[k];
  const inv = 1 / Math.sqrt(sumSq / d + RMS_EPS);
  for (let k = 0; k < d; k++) out[k] = x[k] * inv * w[k];
}

/** out[i] = Σ_k x[k] · W[i*inDim + k] — weights row-major [out, in], no bias. */
function linearRow(
  out: Float32Array,
  x: Float32Array,
  W: Float32Array,
  outDim: number,
  inDim: number,
): void {
  for (let i = 0; i < outDim; i++) {
    let acc = 0;
    const base = i * inDim;
    for (let k = 0; k < inDim; k++) acc += x[k] * W[base + k];
    out[i] = acc;
  }
}

/** Interleaved-pair RoPE over `len` elements at buffer offset (matches model.py's apply_rope). */
function ropeApply(
  vec: Float32Array,
  offset: number,
  len: number,
  cos: Float64Array,
  sin: Float64Array,
  half: number,
  pos: number,
): void {
  const cBase = pos * half;
  for (let i = 0; i < len; i += 2) {
    const x1 = vec[offset + i];
    const x2 = vec[offset + i + 1];
    const c = cos[cBase + (i >> 1)];
    const s = sin[cBase + (i >> 1)];
    vec[offset + i] = x1 * c - x2 * s;
    vec[offset + i + 1] = x1 * s + x2 * c;
  }
}

/**
 * Process one token at position seqLen: fill its K/V cache slots and return
 * the logits for the NEXT token. Mutates the model's workspaces and caches.
 */
export function stepStoryteller(
  model: StorytellerModel,
  id: number,
): Float32Array {
  const { config, weights } = model;
  const d = config.nEmbd;
  const headDim = d / config.nHead;
  const half = headDim / 2;
  const hidden = model.gate.length;
  const pos = model.seqLen;
  const scale = 1 / Math.sqrt(headDim);

  const wteRow = id * d;
  for (let k = 0; k < d; k++) model.x[k] = weights.wte[wteRow + k];

  for (let l = 0; l < config.nLayer; l++) {
    const lw = weights.layers[l];
    const K = model.cacheK[l];
    const V = model.cacheV[l];
    const slot = pos * d;

    // ---- attention block ----
    rmsnormRow(model.h, model.x, lw.ln1, d);
    linearRow(model.qkv, model.h, lw.qkv, 3 * d, d);
    ropeApply(model.qkv, 0, d, model.ropeCos, model.ropeSin, half, pos); // q, all heads
    ropeApply(model.qkv, d, d, model.ropeCos, model.ropeSin, half, pos); // k, all heads
    for (let k = 0; k < d; k++) {
      K[slot + k] = model.qkv[d + k]; // ROPED key (rope is position-baked)
      V[slot + k] = model.qkv[2 * d + k];
    }

    for (let hh = 0; hh < config.nHead; hh++) {
      const qOff = hh * headDim;
      const scores = model.scores;
      let maxScore = -Infinity;
      for (let j = 0; j <= pos; j++) {
        const kOff = j * d + qOff;
        let acc = 0;
        for (let k = 0; k < headDim; k++)
          acc += model.qkv[qOff + k] * K[kOff + k];
        const s = acc * scale;
        scores[j] = s;
        if (s > maxScore) maxScore = s;
      }
      let sum = 0;
      for (let j = 0; j <= pos; j++) {
        scores[j] = Math.exp(scores[j] - maxScore);
        sum += scores[j];
      }
      const invSum = 1 / sum;
      for (let k = 0; k < headDim; k++) {
        let acc = 0;
        for (let j = 0; j <= pos; j++) acc += scores[j] * V[j * d + qOff + k];
        model.attn[qOff + k] = acc * invSum;
      }
    }
    linearRow(model.h, model.attn, lw.proj, d, d);
    for (let k = 0; k < d; k++) model.x[k] += model.h[k];

    // ---- SwiGLU block ----
    rmsnormRow(model.h, model.x, lw.ln2, d);
    linearRow(model.gate, model.h, lw.w1, hidden, d);
    linearRow(model.up, model.h, lw.w3, hidden, d);
    for (let i = 0; i < hidden; i++) {
      const g = model.gate[i];
      model.gate[i] = (g / (1 + Math.exp(-g))) * model.up[i]; // silu(gate) * up
    }
    linearRow(model.h, model.gate, lw.w2, d, hidden);
    for (let k = 0; k < d; k++) model.x[k] += model.h[k];
  }

  // ---- final norm + tied head ----
  rmsnormRow(model.h, model.x, weights.normF, d);
  const logits = model.logits;
  for (let i = 0; i < config.vocabSize; i++) {
    const base = i * d;
    let acc = 0;
    for (let k = 0; k < d; k++) acc += model.h[k] * weights.wte[base + k];
    logits[i] = acc;
  }
  model.seqLen = pos + 1;
  return logits;
}

/** Run step() across a sequence; returns the LAST position's logits (also the prefill path). */
export function prefillStoryteller(
  model: StorytellerModel,
  ids: ArrayLike<number>,
): Float32Array {
  resetStoryteller(model);
  let logits = model.logits;
  for (let i = 0; i < ids.length; i++) {
    logits = stepStoryteller(model, ids[i]);
  }
  return logits;
}

/** top-k + temperature sampling from one logits row (ties kept — mirrors model.py). */
export function sampleFromLogits(
  logits: Float32Array,
  temperature: number,
  topK: number,
  rng: Rng,
): number {
  const t = Math.max(temperature, TEMPERATURE_FLOOR);
  const n = logits.length;
  const scaled = new Float64Array(n);
  for (let i = 0; i < n; i++) scaled[i] = logits[i] / t;

  const k = Math.min(topK, n);
  const sorted = scaled.slice().sort(); // TypedArray sort is numeric
  const kth = sorted[n - k]; // kth largest; values >= kth are kept (ties included)

  let maxV = -Infinity;
  for (let i = 0; i < n; i++)
    if (scaled[i] >= kth && scaled[i] > maxV) maxV = scaled[i];
  let sum = 0;
  const probs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (scaled[i] >= kth) {
      const e = Math.exp(scaled[i] - maxV);
      probs[i] = e;
      sum += e;
    }
  }
  let r = rng() * sum;
  for (let i = 0; i < n; i++) {
    if (probs[i] > 0) {
      r -= probs[i];
      if (r <= 0) return i;
    }
  }
  for (let i = n - 1; i >= 0; i--) if (probs[i] > 0) return i;
  return 0;
}

function argmax(logits: Float32Array): number {
  let best = 0;
  let bestV = logits[0];
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > bestV) {
      bestV = logits[i];
      best = i;
    }
  }
  return best;
}

/**
 * Generate from a prompt. Empty prompts are the caller's to fill (the worker
 * passes the [EOT] id for a fresh story). Past the first window, the cache is
 * rebuilt from the last ctxLen ids — model.py's sliding-window semantics.
 * Cancellation keeps partial output; no early stop at [EOT] (faithful port).
 */
export async function generateStoryteller(
  model: StorytellerModel,
  promptIds: ArrayLike<number>,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  if (promptIds.length === 0) {
    throw new Error(
      "The storyteller needs at least one prompt token (pass the [EOT] id for a fresh story).",
    );
  }
  const ctx = model.config.ctxLen;
  const seq: number[] = Array.from(promptIds);
  let logits = prefillStoryteller(model, seq);
  const generated: number[] = [];
  let cancelled = false;

  for (let n = 0; n < opts.maxTokens; n++) {
    if (opts.isCancelled?.()) {
      cancelled = true;
      break;
    }
    const nextId = opts.greedy
      ? argmax(logits)
      : sampleFromLogits(
          logits,
          opts.temperature,
          opts.topK ?? TOP_K,
          opts.rng,
        );
    generated.push(nextId);
    seq.push(nextId);
    opts.onToken?.(nextId, generated.length);
    await opts.yieldNow?.();

    if (model.seqLen >= ctx) {
      // Window full: rebuild the cache from the last ctxLen ids (drops the oldest).
      logits = prefillStoryteller(model, seq.slice(-ctx));
    } else {
      logits = stepStoryteller(model, nextId);
    }
  }

  return {
    ids: Uint16Array.from(seq),
    tokensGenerated: generated.length,
    cancelled,
  };
}
