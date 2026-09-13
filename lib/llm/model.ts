/**
 * The tiny byte-level decoder-only transformer — weight layout, init,
 * forward pass (with the training activation cache), and seeded generation.
 * Everything operates on caller-owned Float32Array arenas via kernels.ts; the
 * layout order here is ALSO the artifact payload order (artifact.ts) and the
 * init-stream consumption order, both mirrored by training/llm/reference.py.
 *
 * Architecture (pre-LN, GPT-2-flavoured):
 *   x = wte[ids] + wpe;  per layer: x += attn(LN(x)); x += mlp(LN(x));
 *   logits = LN_f(x) · wteᵀ   (tied head — no separate head matrix)
 * MLP hidden = 4·d, GELU(tanh), biases on every linear. Vocab = 256 bytes.
 *
 * Contract: docs/notes/llm-model-training.md. Change this file together with
 * reference.py AND the fixtures (the verify gate enforces agreement).
 */
import {
  embeddingLookup,
  geluInPlace,
  layernormRows,
  linearForward,
  matmulAB,
  matmulABt,
  sampleCategorical,
  softmaxRowInPlace,
  softmaxRows,
} from "./kernels";
import { assertValidConfig, INIT_STD, paramCount } from "./config";
import type { ModelConfig } from "./config";
import { mulberry32, normalSampler } from "./prng";

// ---- weight layout ---------------------------------------------------------

export interface LayerLayout {
  ln1g: number;
  ln1b: number;
  wqkv: number;
  bqkv: number;
  wo: number;
  bo: number;
  ln2g: number;
  ln2b: number;
  w1: number;
  b1: number;
  w2: number;
  b2: number;
}

export interface WeightLayout {
  wte: number;
  wpe: number;
  layers: LayerLayout[];
  lnfg: number;
  lnfb: number;
  /** Total floats — must equal paramCount(config). */
  total: number;
}

export function buildLayout(config: ModelConfig): WeightLayout {
  assertValidConfig(config);
  const d = config.dModel;
  let off = 0;
  const take = (n: number): number => {
    const o = off;
    off += n;
    return o;
  };
  const wte = take(config.vocabSize * d);
  const wpe = take(config.ctxLen * d);
  const layers: LayerLayout[] = [];
  for (let l = 0; l < config.nLayer; l++) {
    layers.push({
      ln1g: take(d),
      ln1b: take(d),
      wqkv: take(3 * d * d),
      bqkv: take(3 * d),
      wo: take(d * d),
      bo: take(d),
      ln2g: take(d),
      ln2b: take(d),
      w1: take(4 * d * d),
      b1: take(4 * d),
      w2: take(d * 4 * d),
      b2: take(d),
    });
  }
  const lnfg = take(d);
  const lnfb = take(d);
  const total = off;
  if (total !== paramCount(config))
    throw new Error(
      `layout total ${total} != paramCount ${paramCount(config)} — contract drift`,
    );
  return { wte, wpe, layers, lnfg, lnfb, total };
}

export interface Model {
  config: ModelConfig;
  layout: WeightLayout;
  /** All weights in one arena, laid out per buildLayout (== artifact order). */
  weights: Float32Array;
}

export function createModel(config: ModelConfig): Model {
  const layout = buildLayout(config);
  return { config, layout, weights: new Float32Array(layout.total) };
}

/**
 * Seeded init: one normal stream fills weight matrices in layout order
 * (LN gains = 1, biases = 0 consume no draws); residual projections (wo, w2)
 * use INIT_STD / sqrt(2·L). Mirrored by reference.py.
 */
export function initWeights(model: Model, seed: number): void {
  const { config, layout, weights } = model;
  const d = config.dModel;
  const next = normalSampler(mulberry32(seed));
  const fill = (off: number, n: number, std: number) => {
    for (let i = 0; i < n; i++) weights[off + i] = std * next();
  };
  fill(layout.wte, config.vocabSize * d, INIT_STD);
  fill(layout.wpe, config.ctxLen * d, INIT_STD);
  const residualStd = INIT_STD / Math.sqrt(2 * config.nLayer);
  for (const l of layout.layers) {
    fill(l.wqkv, 3 * d * d, INIT_STD);
    fill(l.wo, d * d, residualStd);
    fill(l.w1, 4 * d * d, INIT_STD);
    fill(l.w2, d * 4 * d, residualStd);
  }
  for (const l of layout.layers) {
    weights.fill(1, l.ln1g, l.ln1g + d);
    weights.fill(0, l.ln1b, l.ln1b + d);
    weights.fill(0, l.bqkv, l.bqkv + 3 * d);
    weights.fill(0, l.bo, l.bo + d);
    weights.fill(1, l.ln2g, l.ln2g + d);
    weights.fill(0, l.ln2b, l.ln2b + d);
    weights.fill(0, l.b1, l.b1 + 4 * d);
    weights.fill(0, l.b2, l.b2 + d);
  }
  weights.fill(1, layout.lnfg, layout.lnfg + d);
  weights.fill(0, layout.lnfb, layout.lnfb + d);
}

// ---- workspaces ------------------------------------------------------------

/**
 * Forward/backward scratch. Training workspaces (cache !== null) retain the
 * per-layer activations backward() consumes; generation workspaces skip them.
 * Everything is allocated once — hot paths allocate nothing.
 */
export interface LayerCache {
  xIn: Float32Array;
  qkv: Float32Array;
  probs: Float32Array; // [B · nHead · T · T]
  attnCat: Float32Array; // attention output pre-projection (concat heads)
  xAfterAttn: Float32Array; // residual sum feeding ln2
  h1pre: Float32Array; // MLP hidden pre-GELU
}

export interface Workspace {
  batch: number;
  seq: number;
  x: Float32Array; // [B·T, d]
  xn: Float32Array;
  qkv: Float32Array; // [B·T, 3d]
  attnCat: Float32Array; // [B·T, d]
  proj: Float32Array;
  h1: Float32Array; // [B·T, 4d]
  xf: Float32Array; // post final-LN
  logits: Float32Array; // training: [B·T, vocab]; generation: [vocab]
  // per-(b, h) attention scratch
  qh: Float32Array;
  kh: Float32Array;
  vh: Float32Array;
  scores: Float32Array; // [T, T] doubles as probs
  headOut: Float32Array; // [T, dh]
  cache: LayerCache[] | null;
  // ---- training-only (allocated when withCache) ----
  grads: Float32Array | null; // param-sized; zeroed per step
  dy: Float32Array | null; // [B·T, d] stream gradient
  dxExtra: Float32Array | null; // [B·T, d]
  dxExtra2: Float32Array | null; // [B·T, d]
  dqkv: Float32Array | null; // [B·T, 3d]
  dprobs: Float32Array | null; // [T, T]
  dqh: Float32Array | null; // [T, dh]
  dkh: Float32Array | null;
  dvh: Float32Array | null;
  dh4: Float32Array | null; // [B·T, 4d]
}

export function createWorkspace(
  config: ModelConfig,
  batch: number,
  seq: number,
  withCache: boolean,
): Workspace {
  assertValidConfig(config);
  const d = config.dModel;
  const t = Math.min(seq, config.ctxLen);
  const rows = batch * t;
  const dh = d / config.nHead;
  const mkCache = (): LayerCache[] | null => {
    if (!withCache) return null;
    const caches: LayerCache[] = [];
    for (let l = 0; l < config.nLayer; l++) {
      caches.push({
        xIn: new Float32Array(rows * d),
        qkv: new Float32Array(rows * 3 * d),
        probs: new Float32Array(batch * config.nHead * t * t),
        attnCat: new Float32Array(rows * d),
        xAfterAttn: new Float32Array(rows * d),
        h1pre: new Float32Array(rows * 4 * d),
      });
    }
    return caches;
  };
  return {
    batch,
    seq: t,
    x: new Float32Array(rows * d),
    xn: new Float32Array(rows * d),
    qkv: new Float32Array(rows * 3 * d),
    attnCat: new Float32Array(rows * d),
    proj: new Float32Array(rows * d),
    h1: new Float32Array(rows * 4 * d),
    xf: new Float32Array(rows * d),
    logits: new Float32Array(
      withCache ? rows * config.vocabSize : config.vocabSize,
    ),
    qh: new Float32Array(t * dh),
    kh: new Float32Array(t * dh),
    vh: new Float32Array(t * dh),
    scores: new Float32Array(t * t),
    headOut: new Float32Array(t * dh),
    cache: mkCache(),
    grads: withCache ? new Float32Array(buildLayout(config).total) : null,
    dy: withCache ? new Float32Array(rows * d) : null,
    dxExtra: withCache ? new Float32Array(rows * d) : null,
    dxExtra2: withCache ? new Float32Array(rows * d) : null,
    dqkv: withCache ? new Float32Array(rows * 3 * d) : null,
    dprobs: withCache ? new Float32Array(t * t) : null,
    dqh: withCache ? new Float32Array(t * dh) : null,
    dkh: withCache ? new Float32Array(t * dh) : null,
    dvh: withCache ? new Float32Array(t * dh) : null,
    dh4: withCache ? new Float32Array(rows * 4 * d) : null,
  };
}

// ---- forward ---------------------------------------------------------------

/** Copy head h's q/k/v slices out of the strided qkv rows for one sequence.
 * When `src` is provided the gather reads from it (backward replays qkv from
 * the cache); otherwise it reads the workspace's live ws.qkv. Exported for
 * backward.ts — internal to lib/llm, not a public API. */
export function gatherQKV(
  ws: Workspace,
  config: ModelConfig,
  b: number,
  h: number,
  t: number,
  src?: Float32Array,
): void {
  const d = config.dModel;
  const dh = d / config.nHead;
  const qkv = src ?? ws.qkv;
  for (let i = 0; i < t; i++) {
    const row = (b * t + i) * 3 * d;
    for (let j = 0; j < dh; j++) {
      ws.qh[i * dh + j] = qkv[row + h * dh + j];
      ws.kh[i * dh + j] = qkv[row + d + h * dh + j];
      ws.vh[i * dh + j] = qkv[row + 2 * d + h * dh + j];
    }
  }
}

/** Write head h's context vectors back into the concatenated attnCat rows. */
function scatterHead(
  ws: Workspace,
  config: ModelConfig,
  b: number,
  h: number,
  t: number,
): void {
  const d = config.dModel;
  const dh = d / config.nHead;
  for (let i = 0; i < t; i++) {
    const row = (b * t + i) * d + h * dh;
    for (let j = 0; j < dh; j++) ws.attnCat[row + j] = ws.headOut[i * dh + j];
  }
}

/**
 * Full forward pass over ws.batch sequences of byte-token ids. The sequence
 * length is DERIVED from the input: ids.length must equal batch · t with
 * 1 ≤ t ≤ ws.seq — workspaces are allocated for the max, and generation calls
 * adapt down as the window grows. When ws.cache is set (training workspace)
 * the per-layer activations are retained for backward(). Returns the mean
 * next-token cross-entropy (nats/byte, natural log, p clamped at 1e-12) when
 * `targets` (length batch·t, shifted by the caller) is provided; otherwise
 * the logits buffer holds the LAST position's row only (generation path —
 * the tied-head matmul runs for one row, the dominant per-token saving).
 */
export function forward(
  model: Model,
  ws: Workspace,
  ids: Uint8Array,
  targets: Uint8Array | null,
): number | null {
  const { config, layout, weights } = model;
  const d = config.dModel;
  if (ids.length % ws.batch !== 0) throw new Error("ids not a batch multiple");
  const t = ids.length / ws.batch;
  if (t < 1 || t > ws.seq) throw new Error(`t ${t} out of range 1..${ws.seq}`);
  const rows = ws.batch * t;
  const training = ws.cache !== null;

  embeddingLookup(
    ws.x,
    ids,
    weights.subarray(layout.wte),
    weights.subarray(layout.wpe),
    rows,
    d,
    t,
  );

  const scale = 1 / Math.sqrt(d / config.nHead);
  for (let l = 0; l < config.nLayer; l++) {
    const L = layout.layers[l];
    if (training) {
      ws.cache![l].xIn.set(ws.x);
    }
    layernormRows(
      ws.xn,
      ws.x,
      weights.subarray(L.ln1g, L.ln1g + d),
      weights.subarray(L.ln1b, L.ln1b + d),
      rows,
      d,
    );
    linearForward(
      ws.qkv,
      ws.xn,
      weights.subarray(L.wqkv),
      weights.subarray(L.bqkv),
      rows,
      d,
      3 * d,
    );
    if (training) ws.cache![l].qkv.set(ws.qkv);

    for (let b = 0; b < ws.batch; b++) {
      for (let h = 0; h < config.nHead; h++) {
        gatherQKV(ws, config, b, h, t);
        matmulABt(ws.scores, ws.qh, ws.kh, t, d / config.nHead, t, scale);
        softmaxRows(ws.scores, t, t, true);
        if (training) {
          // Strided region is ws.seq² per (b, h); only the leading t² is live.
          const po = (b * config.nHead + h) * ws.seq * ws.seq;
          ws.cache![l].probs.set(ws.scores.subarray(0, t * t), po);
        }
        matmulAB(ws.headOut, ws.scores, ws.vh, t, t, d / config.nHead);
        scatterHead(ws, config, b, h, t);
      }
    }
    if (training) ws.cache![l].attnCat.set(ws.attnCat);
    linearForward(
      ws.proj,
      ws.attnCat,
      weights.subarray(L.wo),
      weights.subarray(L.bo),
      rows,
      d,
      d,
    );
    for (let i = 0; i < rows * d; i++) ws.x[i] += ws.proj[i];
    if (training) ws.cache![l].xAfterAttn.set(ws.x);

    layernormRows(
      ws.xn,
      ws.x,
      weights.subarray(L.ln2g, L.ln2g + d),
      weights.subarray(L.ln2b, L.ln2b + d),
      rows,
      d,
    );
    linearForward(
      ws.h1,
      ws.xn,
      weights.subarray(L.w1),
      weights.subarray(L.b1),
      rows,
      d,
      4 * d,
    );
    if (training) ws.cache![l].h1pre.set(ws.h1);
    geluInPlace(ws.h1, rows * 4 * d);
    linearForward(
      ws.proj,
      ws.h1,
      weights.subarray(L.w2),
      weights.subarray(L.b2),
      rows,
      4 * d,
      d,
    );
    for (let i = 0; i < rows * d; i++) ws.x[i] += ws.proj[i];
  }

  layernormRows(
    ws.xf,
    ws.x,
    weights.subarray(layout.lnfg, layout.lnfg + d),
    weights.subarray(layout.lnfb, layout.lnfb + d),
    rows,
    d,
  );

  if (targets === null) {
    // Generation: logits for the last position only.
    const last = ws.xf.subarray((rows - 1) * d, rows * d);
    matmulABt(
      ws.logits,
      last,
      weights.subarray(layout.wte),
      1,
      d,
      config.vocabSize,
    );
    return null;
  }

  // Training: full logits + mean cross-entropy (natural log, nats/byte).
  matmulABt(
    ws.logits,
    ws.xf,
    weights.subarray(layout.wte),
    rows,
    d,
    config.vocabSize,
  );
  softmaxRows(ws.logits, rows, config.vocabSize, false);
  let loss = 0;
  for (let i = 0; i < rows; i++) {
    const p = ws.logits[i * config.vocabSize + targets[i]];
    loss += -Math.log(Math.max(p, 1e-12));
  }
  return loss / rows;
}

// ---- generation ------------------------------------------------------------

export interface GenerateOptions {
  maxTokens: number;
  temperature: number;
  seed: number;
  /** Streamed chunks of ~8 byte ids; decoded text is the caller's job. */
  onChunk?: (ids: Uint8Array) => void;
}

/** Byte id used to prime an empty prompt (newline — a natural BOS here). */
export const BOS_BYTE = 0x0a;

/**
 * Naive autoregressive sampling: each token re-runs forward on the last ctx
 * window (no KV cache — at ctx ≤ 128 the per-token cost is tens of ms, and
 * simplicity beats latency here). Deterministic per (model, prompt, seed).
 */
export function generate(
  model: Model,
  gws: Workspace,
  promptIds: Uint8Array,
  opts: GenerateOptions,
): Uint8Array {
  const ctx = model.config.ctxLen;
  const vocab = model.config.vocabSize;
  const temperature = Math.min(Math.max(opts.temperature, 0.05), 2);
  const rng = mulberry32(opts.seed);

  const window: number[] = [];
  const push = (id: number) => {
    window.push(id & 0xff);
    if (window.length > ctx) window.shift();
  };
  if (promptIds.length === 0) push(BOS_BYTE);
  else for (const id of promptIds) push(id);

  const out: number[] = [];
  const buf = new Uint8Array(8);
  let bufLen = 0;
  const ids = new Uint8Array(ctx);
  while (out.length < opts.maxTokens) {
    ids.set(window);
    forward(model, gws, ids.subarray(0, window.length), null);
    const lr = gws.logits;
    for (let i = 0; i < vocab; i++) lr[i] /= temperature;
    softmaxRowInPlace(lr, 0, vocab);
    const id = sampleCategorical(lr, 0, vocab, rng());
    push(id);
    out.push(id);
    buf[bufLen++] = id;
    if (bufLen === buf.length) {
      opts.onChunk?.(buf.slice(0, bufLen));
      bufLen = 0;
    }
  }
  if (bufLen > 0) opts.onChunk?.(buf.slice(0, bufLen));
  return Uint8Array.from(out);
}
