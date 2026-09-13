/**
 * Float32Array compute kernels for the tiny transformer — the hot loops of
 * training and generation. Deliberately dumb: every kernel works on caller-
 * owned arenas with explicit shapes (rows × dims) and never allocates, so the
 * worker and the tsx trainer run GC-free. Accumulation policy is part of the
 * determinism contract:
 *
 *   - dot-product kernels (linearForward, matmulABt) accumulate in float64
 *     per output element — exact, engine-independent IEEE semantics;
 *   - rank-1-update kernels (linearGradInput, matmulAB, matmulAtB) accumulate
 *     in float32 in k-ascending order.
 *
 * reference.py mirrors each kernel in numpy (float64); the verify gate
 * compares within abs 1e-5 / rel 1e-3 — bitwise parity is only claimed
 * Node(tsx) ↔ Chrome(V8), never across JS engines (transcendental ulps).
 *
 * Weight convention: linear weights are stored [outDim, inDim] row-major, so
 * forward is x · Wᵀ and the weight-gradient kernel accumulates dyᵀ · x.
 */

/**
 * out[m, outDim] = x[m, inDim] · w[outDim, inDim]ᵀ + bias[outDim].
 * Overwrites out.
 */
export function linearForward(
  out: Float32Array,
  x: Float32Array,
  w: Float32Array,
  bias: Float32Array,
  m: number,
  inDim: number,
  outDim: number,
): void {
  for (let i = 0; i < m; i++) {
    const xo = i * inDim;
    const oo = i * outDim;
    for (let o = 0; o < outDim; o++) {
      const wo = o * inDim;
      let acc = bias[o];
      for (let k = 0; k < inDim; k++) acc += x[xo + k] * w[wo + k];
      out[oo + o] = acc;
    }
  }
}

/**
 * dx[m, inDim] = dy[m, outDim] · w[outDim, inDim] — the input-gradient half of
 * a linear layer's backward. Zeroes dx, then rank-1 updates.
 */
export function linearGradInput(
  dx: Float32Array,
  dy: Float32Array,
  w: Float32Array,
  m: number,
  outDim: number,
  inDim: number,
): void {
  dx.fill(0, 0, m * inDim);
  for (let i = 0; i < m; i++) {
    const dyo = i * outDim;
    const dxo = i * inDim;
    for (let o = 0; o < outDim; o++) {
      const g = dy[dyo + o];
      if (g === 0) continue;
      const wo = o * inDim;
      for (let k = 0; k < inDim; k++) dx[dxo + k] += g * w[wo + k];
    }
  }
}

/**
 * dw[outDim, inDim] += dy[m, outDim]ᵀ · x[m, inDim] and db[outDim] += Σ_i
 * dy[i, ·] — accumulates (callers zero the grad arena once per step).
 */
export function linearGradWeightsAcc(
  dw: Float32Array,
  db: Float32Array,
  dy: Float32Array,
  x: Float32Array,
  m: number,
  outDim: number,
  inDim: number,
): void {
  for (let i = 0; i < m; i++) {
    const dyo = i * outDim;
    const xo = i * inDim;
    for (let o = 0; o < outDim; o++) {
      const g = dy[dyo + o];
      if (g === 0) continue;
      db[o] += g;
      const wo = o * inDim;
      for (let k = 0; k < inDim; k++) dw[wo + k] += g * x[xo + k];
    }
  }
}

/**
 * out[m, n] = scale · a[m, kk] · b[n, kk]ᵀ. Overwrites out. Attention scores
 * (q rows · k rows) use this.
 */
export function matmulABt(
  out: Float32Array,
  a: Float32Array,
  b: Float32Array,
  m: number,
  kk: number,
  n: number,
  scale = 1,
): void {
  for (let i = 0; i < m; i++) {
    const ao = i * kk;
    const oo = i * n;
    for (let j = 0; j < n; j++) {
      const bo = j * kk;
      let acc = 0;
      for (let k = 0; k < kk; k++) acc += a[ao + k] * b[bo + k];
      out[oo + j] = acc * scale;
    }
  }
}

/** out[m, n] = a[m, kk] · b[kk, n]. Overwrites out via rank-1 updates. */
export function matmulAB(
  out: Float32Array,
  a: Float32Array,
  b: Float32Array,
  m: number,
  kk: number,
  n: number,
): void {
  out.fill(0, 0, m * n);
  for (let i = 0; i < m; i++) {
    const ao = i * kk;
    const oo = i * n;
    for (let k = 0; k < kk; k++) {
      const c = a[ao + k];
      if (c === 0) continue;
      const bo = k * n;
      for (let j = 0; j < n; j++) out[oo + j] += c * b[bo + j];
    }
  }
}

/**
 * out[kk, n] = a[m, kk]ᵀ · b[m, n]. Rank-1 updates; accumulated when acc=true
 * (attention dK/V grads per head need zero-per-head, else callers accumulate
 * across batch rows), zeroed first when acc=false.
 */
export function matmulAtB(
  out: Float32Array,
  a: Float32Array,
  b: Float32Array,
  m: number,
  kk: number,
  n: number,
  acc: boolean,
): void {
  if (!acc) out.fill(0, 0, kk * n);
  for (let i = 0; i < m; i++) {
    const ao = i * kk;
    const bo = i * n;
    for (let k = 0; k < kk; k++) {
      const c = a[ao + k];
      if (c === 0) continue;
      const oo = k * n;
      for (let j = 0; j < n; j++) out[oo + j] += c * b[bo + j];
    }
  }
}

/**
 * out[i, d] = wte[ids[i], d] + wpe[i % seq, d] — token + learned position.
 * Rows are batch·seq stacked per sequence, so the position index resets at
 * each sequence boundary.
 */
export function embeddingLookup(
  out: Float32Array,
  ids: Uint8Array,
  wte: Float32Array,
  wpe: Float32Array,
  rows: number,
  d: number,
  seq: number,
): void {
  for (let i = 0; i < rows; i++) {
    const eo = ids[i] * d;
    const po = (i % seq) * d;
    const oo = i * d;
    for (let j = 0; j < d; j++) out[oo + j] = wte[eo + j] + wpe[po + j];
  }
}

/** Per-row layer normalisation: out = (x − mean) / sqrt(var + eps) · g + b. */
export function layernormRows(
  out: Float32Array,
  x: Float32Array,
  gain: Float32Array,
  bias: Float32Array,
  rows: number,
  dims: number,
  eps = 1e-5,
): void {
  for (let r = 0; r < rows; r++) {
    const o = r * dims;
    let mean = 0;
    for (let j = 0; j < dims; j++) mean += x[o + j];
    mean /= dims;
    let varAcc = 0;
    for (let j = 0; j < dims; j++) {
      const v = x[o + j] - mean;
      varAcc += v * v;
    }
    const invStd = 1 / Math.sqrt(varAcc / dims + eps);
    for (let j = 0; j < dims; j++)
      out[o + j] = (x[o + j] - mean) * invStd * gain[j] + bias[j];
  }
}

/** In-place GELU (tanh form) — 0.5x(1 + tanh(√(2/π)(x + 0.044715x³))). */
const GELU_C = Math.sqrt(2 / Math.PI);
export function geluInPlace(x: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    const v = x[i];
    x[i] = 0.5 * v * (1 + Math.tanh(GELU_C * (v + 0.044715 * v * v * v)));
  }
}

/**
 * Row softmax in place. With causal=true row r keeps only columns ≤ r
 * (attention at row r may see positions 0..r).
 */
export function softmaxRows(
  x: Float32Array,
  rows: number,
  cols: number,
  causal: boolean,
): void {
  for (let r = 0; r < rows; r++) {
    const o = r * cols;
    const limit = causal ? r + 1 : cols;
    let max = -Infinity;
    for (let j = 0; j < limit; j++) if (x[o + j] > max) max = x[o + j];
    let sum = 0;
    for (let j = 0; j < limit; j++) {
      const e = Math.exp(x[o + j] - max);
      x[o + j] = e;
      sum += e;
    }
    const inv = 1 / sum;
    for (let j = 0; j < limit; j++) x[o + j] *= inv;
    for (let j = limit; j < cols; j++) x[o + j] = 0;
  }
}

/**
 * Categorical sample from a probability row: smallest index with cume > u,
 * falling back to the last index when float rounding eats the tail.
 */
export function sampleCategorical(
  probs: Float32Array,
  off: number,
  n: number,
  u: number,
): number {
  let cume = 0;
  for (let i = 0; i < n; i++) {
    cume += probs[off + i];
    if (u < cume) return i;
  }
  return n - 1;
}

/** Single-row softmax over the logits slice `x[off, off + n)` (sampling). */
export function softmaxRowInPlace(
  x: Float32Array,
  off: number,
  n: number,
): void {
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (x[off + i] > max) max = x[off + i];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(x[off + i] - max);
    x[off + i] = e;
    sum += e;
  }
  const inv = 1 / sum;
  for (let i = 0; i < n; i++) x[off + i] *= inv;
}

// ---- backward kernels --------------------------------------------------------

/**
 * Layer normalisation backward. Per row, with x̂ = (x − mean)·invStd:
 *   dg[j] += dy·x̂,  db[j] += dy,
 *   dx = g ⊙ invStd ⊙ (dy − mean(dy) − x̂ · mean(dy·x̂)).
 * dx is overwritten; dg/db accumulate across rows (arena zeroed per step).
 */
export function layernormRowsBwd(
  dx: Float32Array,
  dg: Float32Array,
  db: Float32Array,
  dy: Float32Array,
  x: Float32Array,
  gain: Float32Array,
  rows: number,
  dims: number,
  eps = 1e-5,
): void {
  for (let r = 0; r < rows; r++) {
    const o = r * dims;
    let mean = 0;
    for (let j = 0; j < dims; j++) mean += x[o + j];
    mean /= dims;
    let varAcc = 0;
    for (let j = 0; j < dims; j++) {
      const v = x[o + j] - mean;
      varAcc += v * v;
    }
    const invStd = 1 / Math.sqrt(varAcc / dims + eps);
    let meanDy = 0;
    let meanDyXhat = 0;
    for (let j = 0; j < dims; j++) {
      const g = dy[o + j];
      meanDy += g;
      meanDyXhat += g * ((x[o + j] - mean) * invStd);
      dg[j] += g * ((x[o + j] - mean) * invStd);
      db[j] += g;
    }
    meanDy /= dims;
    meanDyXhat /= dims;
    for (let j = 0; j < dims; j++) {
      const xhat = (x[o + j] - mean) * invStd;
      dx[o + j] = gain[j] * invStd * (dy[o + j] - meanDy - xhat * meanDyXhat);
    }
  }
}

/**
 * GELU(tanh) backward: dpre[i] = dpost[i] · gelu′(pre[i]). Overwrites dpre.
 * gelu′(x) = 0.5(1+tanh u) + 0.5x(1−tanh²u)·u′, u = c(x + 0.044715x³),
 * u′ = c(1 + 3·0.044715x²).
 */
const GELU_C_BWD = Math.sqrt(2 / Math.PI);
export function geluBackward(
  dpre: Float32Array,
  dpost: Float32Array,
  pre: Float32Array,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const v = pre[i];
    const u = GELU_C_BWD * (v + 0.044715 * v * v * v);
    const th = Math.tanh(u);
    const du = GELU_C_BWD * (1 + 3 * 0.044715 * v * v);
    dpre[i] = dpost[i] * (0.5 * (1 + th) + 0.5 * v * (1 - th * th) * du);
  }
}

/**
 * Softmax backward for one attention head's probability block [t, t] (causal —
 * masked columns hold prob 0, which zeroes their dscore automatically):
 *   dscores[i,j] = probs[i,j] · (dprobs[i,j] − Σ_k dprobs[i,k]·probs[i,k])
 * then scaled by `scale`. Overwrites dscores.
 */
export function softmaxBackwardRows(
  dscores: Float32Array,
  dprobs: Float32Array,
  probs: Float32Array,
  t: number,
  scale: number,
): void {
  for (let r = 0; r < t; r++) {
    const o = r * t;
    let dot = 0;
    for (let j = 0; j <= r; j++) dot += dprobs[o + j] * probs[o + j];
    for (let j = 0; j <= r; j++)
      dscores[o + j] = probs[o + j] * (dprobs[o + j] - dot) * scale;
    for (let j = r + 1; j < t; j++) dscores[o + j] = 0;
  }
}
