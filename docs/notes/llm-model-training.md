# LLM Lab — model training, contract, and gate

The /llm-lab feature: visitors train a tiny byte-level transformer in a web
worker (guided five-card workflow), and James ships a sample checkpoint
trained offline by the *same* TypeScript trainer. No ML framework anywhere —
forward, backward, Adam, the artifact container, and sampling are hand-written
over `Float32Array` in `lib/llm/` and shared verbatim by the browser worker,
the offline tsx trainer, and the verify gate. This note mirrors
`chess-model-training.md` / `voice-cloning-architecture.md`: verified facts,
the contract, gate numbers, the fallback ladder, open concerns.

## 1. Verified facts

**Architecture** (pre-LN decoder-only transformer, GPT-2-flavoured, tied output
head — `logits = LN_f(x) · wteᵀ`):

- Byte-level vocabulary: one token per UTF-8 byte, vocab 256 (`TextEncoder`).
- Learned positional embeddings, GELU(tanh) MLP at 4× width, biases on every
  linear, no dropout (memorization of tiny corpora is the intended behaviour).
- Parameter formula (`paramCount` in `lib/llm/config.ts`, mirrored in
  `training/llm/reference.py`): `256d + ctx·d + L(12d² + 13d) + 2d`.

**Presets** (single source of truth: `PRESETS` in `lib/llm/config.ts`):

| Preset | d | L | heads | ctx | params | step tokens (B·T) |
| --- | --- | --- | --- | --- | --- | --- |
| nano | 64 | 2 | 4 | 64 | 120,576 | 8·64 = 512 (visitor) |
| small | 96 | 4 | 4 | 96 | 481,344 | 6·96 = 576 (visitor); 32·96 offline |
| mini | 128 | 4 | 4 | 128 | 842,496 | 4·128 = 512 |
| micro (fixtures only) | 16 | 2 | 2 | 8 | 10,816 | 1·8 |

Training defaults: Adam β=(0.9, 0.99), ε=1e-8, no weight decay; peak LR 3e-3,
5% linear warmup, cosine decay to 10%; global grad-norm clip 1.0; init N(0,
0.02) with residual projections at 0.02/√(2L).

**Measured throughput** (`training/llm/probe.ts`, James's Windows machine,
Node 24, warm JIT):

| shape mix | GFLOP/s |
| --- | --- |
| nano shapes (m=512, d=64) | 2.08 mean |
| small shapes (m=576, d=96) | 1.69 mean |
| mini shapes (m=512, d=128) | 1.66 mean |

Calibrated against real steps: nano visitor step (512 tokens) ≈ 0.2 s
(measured 2,535 tok/s in an 80-step smoke run); small offline step
(B=32×T=96, 3,072 tokens) ≈ 4.9 s (measured ~630–645 tok/s). Realized
throughput therefore matches the matmul probe within ~10% — the 6N+overhead
rule holds.

**The calibration contract**: the worker times a ~100 ms matmul at init and
the UI scales default steps to land near 60 s wall time
(`calibrationToSteps`, clamped [25, 400]). Preset `defaultSteps` are the
fallbacks when calibration is unavailable.

**Visitor default outcome (measured)**: nano, 80 steps, 48 KB Shakespeare,
seed 1 — loss 5.5 → EMA 2.88 in 16.9 s; samples move from uniform noise to
word fragments ("get he, oly s hesl e h g he w t"). That is the honest demo
bar; the copy never promises more.

**Sample artifact (small preset, fp16)**: 962,720 bytes — plain git, chess
precedent (0.7 MB ONNX artifacts), no Git LFS involved, no Vercel toggle
dependency.

## 2. The contract (single source, two languages)

Written once here and mirrored in both sides' doc comments; change
`lib/llm/{config,prng,tokenizer,model,kernels,backward,adam,artifact,trainLoop}.ts`
together with `training/llm/{reference.py,make_fixtures.py}` AND the fixtures.

- **Weight layout**: one flat f32 arena in `buildLayout` order — wte, wpe,
  then per layer (ln1g, ln1b, wqkv, bqkv, wo, bo, ln2g, ln2b, w1, b1, w2,
  b2), then lnf — which is simultaneously the init-stream consumption order
  and the artifact payload order.
- **Determinism**: three substreams from one seed — init `mulberry32(seed)`,
  batch offsets `mulberry32(seed ^ 0x9E3779B9)`, eval samples
  `mulberry32(0x5EED)`. mulberry32 and the Box-Muller wrapper are
  bit-mirrored in numpy (the gate checks the uniform stream exactly).
- **Kernels**: dot-product kernels accumulate in f64; rank-1-update kernels in
  f32 k-ascending. numpy reference computes in f64 — parity is therefore
  tolerance-based (below), never bitwise.
- **Cross-engine claim**: bit-exactness is claimed ONLY Node(tsx) ↔ Chrome
  (both V8). `Math.exp/tanh` may differ in the last ulp on other engines;
  generations can differ there by design. The UI never promises otherwise.
- **Artifact ("JLLM" v1)**: 32-byte LE header (magic, version, dtype
  fp32/fp16, config, param count, CRC32 of payload, payload length, reserved)
  then weights in layout order. fp16 encode is hand-written
  round-to-nearest-even with clamp-to-±65504 (no `Float16Array` dependency);
  decode validates with human sentences ("This file isn't an LLM Lab model…").
- **Loss**: mean next-token CE over all B·T positions, nats/byte, p clamped
  at 1e-12. mid-training samples: 32 tokens at temperature 0.8 from a newline
  prompt under `EVAL_SEED`.

## 3. Gate procedure and numbers — `npm run verify:llm-model`

Fixture generation (`python training/llm/make_fixtures.py`) runs the numpy
reference on the micro model AND finite-difference-checks the reference's own
backward — fixture generation fails loudly if gradcheck exceeds tolerance, so
a bad gradient cannot ship as a golden value.

Measured on gate day (this machine):

| check | result |
| --- | --- |
| tokenizer (incl. multibyte) | exact, 6/6 |
| mulberry32 first-32 uniforms | exact |
| Box-Muller first-8 normals | max diff 2.72e-5 (5-sig fixture rounding) |
| LR schedule table (40 values) | max diff 4.67e-8 |
| micro init weights (10,816) | max diff 5.0e-7 |
| micro forward probs (2,048) | max diff 5.02e-8 |
| micro loss | 5.49303 vs 5.493 |
| grad norm pre-clip | 2.8326 vs 2.8326 |
| post-step weights (10,816) | max diff 2.11e-5 (within rel 1e-3) |
| post-step loss | 5.34010 vs 5.3401 |
| numpy reference gradcheck | max rel 1.213e-3 (floor 1e-6), max abs 7.674e-6 |
| artifact sha256, fp32 + fp16 | byte-identical across languages |
| container round-trip / corrupt rejection | 4/4 |
| sample-artifact regression | seeded generations from the shipped fp16 artifact must equal `fixtures/sample_expectations.json` exactly; absent artifact → "skipped" |

Tolerances: abs 1e-5 OR rel 1e-3 on fixture values rounded to 5 significant
digits (voice precedent). **GATE: PASSED — 27/27** with the sample shipped.

**The shipped sample** (`public/models/llm/llm-portfolio.bin`): small preset
trained on the portfolio corpus (18,003 bytes) — 500 steps, batch 32
(3,072 tokens/step), seed 1, 39.5 min on the dev machine, final EMA loss
1.09 nats/byte; 962,720 bytes fp16, sha256 `aa9f9e3b…`, crc32 `a06c7ca8`.
Generations recite and remix the site (measured: "…appast pulying carossit…
nursing psthonf", "Data Sciencstis" emerges by mid-training) — memorisation
of a tiny corpus, as designed and as the page copy states.

Gradcheck metric note: f32 weight storage rounds the ±h perturbation, so the
relative-error denominator floors at 1e-6 — without that, near-zero gradients
inflate a ~1e-9 absolute wobble into a misleading relative error (measured:
worst row was analytic −6.34e-8 vs numeric −6.22e-8, abs 1.2e-9).

## 4. Fallback ladder

1. **Hand-rolled TS over Float32Array (shipped)** — no runtime deps; realized
   ~1.7–2.1 GFLOP/s on desktop, acceptable 60 s budgets at shipped sizes.
2. tf.js — rejected: ~MB-scale dependency for a model a plain loop can serve;
   against the repo's minimal-deps rule (§33).
3. ONNX Runtime Web training APIs — rejected: training isn't in the shipping
   wasm build; ORT stays the chess/voice inference runtime only.
4. WebGPU/WebNN backend — deferred: real speedup (10×+) but a second kernel
   set to verify; V1 proves the workflow first.
5. KV-cached generation — deferred: ctx ≤ 128 makes redundant recompute
   tens of ms per token; invisible under streaming-chunk UX.

## 5. Open concerns flagged to James

- **2026-09-13 — visitor models are intentionally weak.** 60 s of CPU training
  is a process demo, not a product model; page copy carries that framing, and
  the shipped sample carries the quality story. Revisit if a future phase adds
  a WebGPU backend or longer "keep training" paths.
- **2026-09-13 — the portfolio corpus recites.** At 18,003 bytes the sample
  memorizes James's approved copy; multi-line verbatim recitation is possible
  (it's the point) — but it means the sample's words are not editorialized by
  anyone. The page disclaimer ("wordplay, not fact; not the grounded JTB
  chatbot") is load-bearing.
- **2026-09-13 — cross-engine generation divergence.** A visitor on
  Safari/Firefox may see different tokens than the verify gate's recordings.
  Accepted: determinism is a V8-to-V8 property, documented above.
- **2026-09-13 — runtime URL fetch is client-side only.** CORS denials are
  explained in-band with a paste fallback; there is deliberately no server
  proxy (open-proxy abuse surface).
