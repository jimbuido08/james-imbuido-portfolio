/**
 * Phase LLM-0 throughput probe — times the shipped kernels at the matmul
 * shapes that dominate each preset's training step and prints measured
 * GFLOP/s so the preset step defaults come from real numbers, not guesses.
 * Informational only (always exits 0); run:
 *
 *   npx tsx training/llm/probe.ts
 *
 * Record the output in docs/notes/llm-model-training.md and re-tune
 * PRESETS.*.defaultSteps / calibration constants in lib/llm/config.ts.
 */
import { matmulABt } from "../../lib/llm/kernels";
import { PRESETS, flopsPerStep, TARGET_TRAIN_SECONDS } from "../../lib/llm/config";
import type { Preset } from "../../lib/llm/config";

interface BenchResult {
  label: string;
  flops: number;
  msPerIter: number;
  gflops: number;
}

/**
 * Timed mix per preset: per step the dominant linears split roughly 1:1:2
 * across (d→3d qkv-shaped), (d→d), and (d→4d / 4d→d MLP) shapes, in both
 * directions during backward — approximated here by timing the two extreme
 * shapes and their midpoint and averaging the rates.
 */
function benchPreset(p: Preset): BenchResult[] {
  const m = p.batchSize * p.config.ctxLen;
  const d = p.config.dModel;
  const shapes: Array<[string, number, number, number, number]> = [
    ["m×d×d", m, d, d, 1],
    ["m×d×3d", m, d, 3 * d, 1],
    ["m×d×4d", m, d, 4 * d, 1],
    ["m×4d×d", m, 4 * d, d, 1],
  ];
  const results: BenchResult[] = [];
  for (const [label, rows, kk, n] of shapes) {
    const a = new Float32Array(rows * kk);
    const b = new Float32Array(n * kk);
    const out = new Float32Array(rows * n);
    for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.37) * 0.5;
    for (let i = 0; i < b.length; i++) b[i] = Math.cos(i * 0.19) * 0.5;

    // Warm the JIT, then take the median of 5 windows.
    matmulABt(out, a, b, rows, kk, n);
    const windows: number[] = [];
    const targetMs = 250;
    for (let w = 0; w < 5; w++) {
      const t0 = performance.now();
      let iters = 0;
      while (performance.now() - t0 < targetMs) {
        matmulABt(out, a, b, rows, kk, n);
        iters++;
      }
      const elapsed = performance.now() - t0;
      windows.push(elapsed / iters);
    }
    windows.sort((x, y) => x - y);
    const msPerIter = windows[2];
    const flops = 2 * rows * kk * n;
    results.push({
      label,
      flops,
      msPerIter,
      gflops: flops / (msPerIter * 1e6),
    });
  }
  return results;
}

console.log(`LLM probe — node ${process.version}`);
console.log("=".repeat(68));
for (const key of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
  const p = PRESETS[key];
  const results = benchPreset(p);
  const meanGflops =
    results.reduce((s, r) => s + r.gflops, 0) / results.length;
  console.log(
    `\n[${p.key}] d=${p.config.dModel} L=${p.config.nLayer} ctx=${p.config.ctxLen} ` +
      `B=${p.batchSize}  (step ≈ ${(flopsPerStep(p) / 1e9).toFixed(2)} GFLOP)`,
  );
  for (const r of results)
    console.log(
      `  ${r.label.padEnd(8)} ${r.msPerIter.toFixed(2)} ms  →  ${r.gflops.toFixed(2)} GFLOP/s`,
    );
  const stepSeconds = flopsPerStep(p) / (meanGflops * 1e9);
  const stepsAtTarget = Math.round(TARGET_TRAIN_SECONDS / stepSeconds);
  console.log(
    `  mean ${meanGflops.toFixed(2)} GFLOP/s → ${stepSeconds.toFixed(2)} s/step, ` +
      `≈${stepsAtTarget} steps in ${TARGET_TRAIN_SECONDS}s (current default ${p.defaultSteps})`,
  );
}
