/**
 * The backward pass — consumes the activation cache written by the most
 * recent forward(..., targets) call on a training workspace and fills
 * ws.grads (caller zeroed it). Mean cross-entropy over all B·T positions is
 * the loss, so dlogits = (softmax(logits) − onehot(target)) / (B·T); forward
 * left softmax probs in ws.logits, and they are mutated into dlogits in
 * place. The head is tied: dxf flows through wte, and wte's gradient
 * accumulates both the tied-head matmul and the input-embedding scatter-add.
 *
 * Formulas are the textbook ones; training/llm/reference.py mirrors them in
 * numpy and the make_fixtures.py finite-difference check (max rel err
 * recorded in the fixture) plus the gate's one-step parity prove agreement.
 */
import {
  geluBackward,
  geluInPlace,
  layernormRows,
  layernormRowsBwd,
  linearGradInput,
  linearGradWeightsAcc,
  matmulAB,
  matmulABt,
  matmulAtB,
  softmaxBackwardRows,
} from "./kernels";
import { gatherQKV } from "./model";
import type { Model, Workspace } from "./model";
import type { ModelConfig } from "./config";

/** Reverse of scatterHead: pull head h's d-context slice out of dattnCat. */
function gatherHeadGrad(
  headOut: Float32Array,
  dattnCat: Float32Array,
  config: ModelConfig,
  b: number,
  h: number,
  t: number,
): void {
  const d = config.dModel;
  const dh = d / config.nHead;
  for (let i = 0; i < t; i++) {
    const row = (b * t + i) * d + h * dh;
    for (let j = 0; j < dh; j++) headOut[i * dh + j] = dattnCat[row + j];
  }
}

/** Scatter dq/dk/dv [t, dh] slices into the strided dqkv [B·T, 3d] rows. */
function scatterQkvGrads(
  ws: Workspace,
  config: ModelConfig,
  b: number,
  h: number,
  t: number,
): void {
  const d = config.dModel;
  const dh = d / config.nHead;
  const dqkv = ws.dqkv!;
  for (let i = 0; i < t; i++) {
    const row = (b * t + i) * 3 * d;
    for (let j = 0; j < dh; j++) {
      dqkv[row + h * dh + j] = ws.dqh![i * dh + j];
      dqkv[row + d + h * dh + j] = ws.dkh![i * dh + j];
      dqkv[row + 2 * d + h * dh + j] = ws.dvh![i * dh + j];
    }
  }
}

/**
 * Precondition: forward(model, ws, ids, targets) just ran on a workspace
 * created withCache=true, and ws.grads was zeroed. Fills ws.grads.
 */
export function backward(
  model: Model,
  ws: Workspace,
  ids: Uint8Array,
  targets: Uint8Array,
): void {
  if (!ws.cache || !ws.grads)
    throw new Error("backward needs a training workspace");
  const { config, layout, weights } = model;
  const d = config.dModel;
  const t = ws.seq;
  const rows = ws.batch * t;
  const vocab = config.vocabSize;
  const dh = d / config.nHead;
  const scale = 1 / Math.sqrt(dh);
  const grads = ws.grads;
  const dy = ws.dy!;
  const dxA = ws.dxExtra!;
  const dxB = ws.dxExtra2!;

  // 1) probs → dlogits, scaled by the mean factor.
  const dl = ws.logits; // [rows, vocab], softmax'd by forward
  for (let i = 0; i < rows; i++) dl[i * vocab + targets[i]] -= 1;
  const invRows = 1 / rows;
  for (let i = 0; i < rows * vocab; i++) dl[i] *= invRows;

  // 2) Tied head: dxf and dwte.
  const wte = weights.subarray(layout.wte, layout.wte + vocab * d);
  matmulAB(dy, dl, wte, rows, vocab, d);
  matmulAtB(
    grads.subarray(layout.wte, layout.wte + vocab * d),
    dl,
    ws.xf,
    rows,
    vocab,
    d,
    true,
  );

  // 3) Final layer norm (its forward input is still live in ws.x).
  layernormRowsBwd(
    dxA,
    grads.subarray(layout.lnfg, layout.lnfg + d),
    grads.subarray(layout.lnfb, layout.lnfb + d),
    dy,
    ws.x,
    weights.subarray(layout.lnfg, layout.lnfg + d),
    rows,
    d,
  );
  dy.set(dxA.subarray(0, rows * d));

  for (let l = config.nLayer - 1; l >= 0; l--) {
    const L = layout.layers[l];
    const G = (off: number, n: number) => grads.subarray(off, off + n);
    const W = (off: number, n: number) => weights.subarray(off, off + n);
    const cache = ws.cache[l];

    // ---- MLP branch ----
    // Recompute gelu(h1pre) for w2's weight grad (h1 is free scratch now).
    ws.h1.set(cache.h1pre);
    geluInPlace(ws.h1, rows * 4 * d);
    linearGradWeightsAcc(
      G(L.w2, d * 4 * d),
      G(L.b2, d),
      dy,
      ws.h1,
      rows,
      d,
      4 * d,
    );
    linearGradInput(ws.dh4!, dy, W(L.w2, d * 4 * d), rows, d, 4 * d);
    geluBackward(ws.h1, ws.dh4!, cache.h1pre, rows * 4 * d); // h1 := dpre-activation
    layernormRows(ws.xn, cache.xAfterAttn, W(L.ln2g, d), W(L.ln2b, d), rows, d);
    linearGradWeightsAcc(
      G(L.w1, 4 * d * d),
      G(L.b1, 4 * d),
      ws.h1,
      ws.xn,
      rows,
      4 * d,
      d,
    );
    linearGradInput(dxA, ws.h1, W(L.w1, 4 * d * d), rows, 4 * d, d);
    layernormRowsBwd(
      dxB,
      G(L.ln2g, d),
      G(L.ln2b, d),
      dxA,
      cache.xAfterAttn,
      W(L.ln2g, d),
      rows,
      d,
    );
    for (let i = 0; i < rows * d; i++) dy[i] += dxB[i]; // stream grad at post-attn residual

    // ---- attention branch ----
    linearGradWeightsAcc(
      G(L.wo, d * d),
      G(L.bo, d),
      dy,
      cache.attnCat,
      rows,
      d,
      d,
    );
    linearGradInput(dxA, dy, W(L.wo, d * d), rows, d, d); // dxA := dattnCat
    ws.dqkv!.fill(0);
    for (let b = 0; b < ws.batch; b++) {
      for (let h = 0; h < config.nHead; h++) {
        const probsOff = (b * config.nHead + h) * ws.seq * ws.seq;
        const probs = cache.probs.subarray(probsOff, probsOff + t * t);
        gatherHeadGrad(ws.headOut, dxA, config, b, h, t);
        gatherQKV(ws, config, b, h, t, cache.qkv);
        // dprobs = dctx · vᵀ ;  dV = probsᵀ · dctx
        matmulABt(ws.dprobs!, ws.headOut, ws.vh, t, dh, t);
        matmulAtB(ws.dvh!, probs, ws.headOut, t, t, dh, false);
        // softmax backward → dscores ; dq = dscores·k ; dk = dscoresᵀ·q
        softmaxBackwardRows(ws.scores, ws.dprobs!, probs, t, scale);
        matmulAB(ws.dqh!, ws.scores, ws.kh, t, t, dh);
        matmulAtB(ws.dkh!, ws.scores, ws.qh, t, t, dh, false);
        scatterQkvGrads(ws, config, b, h, t);
      }
    }
    layernormRows(ws.xn, cache.xIn, W(L.ln1g, d), W(L.ln1b, d), rows, d);
    linearGradWeightsAcc(
      G(L.wqkv, 3 * d * d),
      G(L.bqkv, 3 * d),
      ws.dqkv!,
      ws.xn,
      rows,
      3 * d,
      d,
    );
    linearGradInput(dxA, ws.dqkv!, W(L.wqkv, 3 * d * d), rows, 3 * d, d);
    layernormRowsBwd(
      dxB,
      G(L.ln1g, d),
      G(L.ln1b, d),
      dxA,
      cache.xIn,
      W(L.ln1g, d),
      rows,
      d,
    );
    for (let i = 0; i < rows * d; i++) dy[i] += dxB[i]; // stream grad into block input
  }

  // 4) Embedding grads: token scatter-add (dwte accumulates with the tied
  //    head's) and position scatter-add (position = row % t).
  const gwte = grads.subarray(layout.wte, layout.wte + vocab * d);
  const gwpe = grads.subarray(layout.wpe, layout.wpe + config.ctxLen * d);
  for (let i = 0; i < rows; i++) {
    const eo = ids[i] * d;
    const po = (i % t) * d;
    const oo = i * d;
    for (let j = 0; j < d; j++) {
      gwte[eo + j] += dy[oo + j];
      gwpe[po + j] += dy[oo + j];
    }
  }
}
