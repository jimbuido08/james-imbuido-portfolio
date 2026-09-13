/**
 * Adam + LR schedule for the tiny trainer. One flat arena layout means the
 * optimizer sees the whole parameter vector, which makes the global-norm clip
 * trivially cheap. The schedule is a pure function (fixtures pin a table of
 * its values): linear warmup over the first warmupFrac of steps, then cosine
 * decay to finalLrFrac · peak. reference.py mirrors both exactly; the single
 * gradient-step fixture runs Adam at constant peak LR to isolate optimizer
 * math from the schedule.
 */

export interface AdamState {
  m: Float32Array;
  v: Float32Array;
}

export function createAdamState(size: number): AdamState {
  return { m: new Float32Array(size), v: new Float32Array(size) };
}

/** 0-based step → learning rate. */
export function lrAt(
  step: number,
  totalSteps: number,
  peakLr: number,
  warmupFrac: number,
  finalLrFrac: number,
): number {
  const warmupSteps = Math.max(1, Math.floor(warmupFrac * totalSteps));
  if (step < warmupSteps) return (peakLr * (step + 1)) / warmupSteps;
  const span = Math.max(1, totalSteps - warmupSteps);
  const progress = Math.min(1, (step - warmupSteps) / span);
  const floor = finalLrFrac * peakLr;
  return floor + 0.5 * (1 + Math.cos(Math.PI * progress)) * (peakLr - floor);
}

/** Global grad norm over the flat arena (float64 accumulation). */
export function gradNorm(grads: Float32Array): number {
  let acc = 0;
  for (let i = 0; i < grads.length; i++) acc += grads[i] * grads[i];
  return Math.sqrt(acc);
}

/** Scale the grad arena in place (used for global-norm clipping). */
export function scaleGrads(grads: Float32Array, s: number): void {
  for (let i = 0; i < grads.length; i++) grads[i] *= s;
}

/**
 * One Adam step with bias correction. `t` is 1-based (the count of completed
 * steps). Gradients are consumed read-only.
 */
export function adamStep(
  weights: Float32Array,
  grads: Float32Array,
  state: AdamState,
  lr: number,
  t: number,
  beta1: number,
  beta2: number,
  eps: number,
): void {
  const bc1 = 1 - Math.pow(beta1, t);
  const bc2 = 1 - Math.pow(beta2, t);
  const { m, v } = state;
  for (let i = 0; i < weights.length; i++) {
    const g = grads[i];
    m[i] = beta1 * m[i] + (1 - beta1) * g;
    v[i] = beta2 * v[i] + (1 - beta2) * g * g;
    const mHat = m[i] / bc1;
    const vHat = v[i] / bc2;
    weights[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
  }
}
