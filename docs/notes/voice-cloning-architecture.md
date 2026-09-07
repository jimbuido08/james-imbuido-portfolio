# Real-Time Voice Cloning — architecture notes

Status: **Milestone A feasibility gate PASSED** (2026-09-07, tsx + real Chrome; Safari pending
James). This document holds
the verified facts about the SV2TTS reference stack, the ONNX export contract that
follows from them, the gate procedure, and (to be filled) the measured numbers the
gate decision hinges on. Reference repo: CorentinJ/Real-Time-Voice-Cloning (PyTorch),
cloned read-only at `training/voice/_rtvc-src/` for study; all facts below were read
from its source at master (2026-09), not from memory.

## 1. Verified reference-stack facts

### Checkpoints (HuggingFace `CorentinJ/SV2TTS`, fp32)

| model | file | size | fp16 estimate |
|---|---|---|---|
| Speaker encoder (GE2E) | `encoder.pt` | 17.1 MB | ~9 MB |
| Synthesizer (Tacotron) | `synthesizer.pt` | **371 MB** | ~186 MB |
| Vocoder (WaveRNN) | `vocoder.pt` | 53.8 MB | ~27 MB |

The plan's ~45–70 MB artifact estimate was wrong — the Tacotron dominates. Total
shipped fp16 ≈ 220 MB, int8 ≈ 115 MB. Download size is now a first-class gate
concern (flagged below, §5).

### Speaker encoder (`encoder/model.py`, `encoder/inference.py`)

- 3-layer LSTM, input 40, hidden 256, batch-first; final-frame hidden → Linear 256 →
  ReLU → L2-normalise (+1e-5). `forward(utterances, hidden_init)` takes
  **(batch, n_frames, 40)** time-major mels.
- Mel: **power mel (not log)** — `librosa.feature.melspectrogram` defaults, sr 16000,
  n_fft 400 (25 ms window), hop 160 (10 ms step), **40 bins**, librosa-default fmin
  0 / fmax 8000, `float32.T` (frames time-major). No pre-emphasis, no normalisation.
- `embed_utterance`: wave → zero-pad → mel → **160-frame partials at 80-frame step
  (50 % overlap)** → embed each partial → mean → L2-normalise. The split/mean/norm
  happens in numpy and will live in TS (`lib/voice`), not in the graph.
- Tail partials ≥ 75 % padded are kept, else dropped (`min_pad_coverage = 0.75`).

### Synthesizer (`synthesizer/models/tacotron.py`, `hparams.py`, `utils/symbols.py`)

- Tacotron: embed 512, encoder 256 (CBHG K=5, 4 highways), decoder 128, lstm 1024,
  postnet 512, speaker_embedding 256, dropout 0.5. Inference reduction factor `r`
  comes from the checkpoint's `decoder.r` buffer (schedule ends at r=2) — **export
  must read and respect it**, never assume 1.
- `generate()` decodes autoregressively with a **Python `for t in range(0, steps, r)`
  + data-dependent break** — unrolls to a ~2000-step traced graph, i.e. not
  shippable. This forced the plan's "fallback" (JS-driven decoder-step export) to
  become the **primary** design (§2).
- `LSA` attention lazily initialises `cumulative`/`attention` buffers at `t == 0`;
  the step-cell export passes them explicitly as loop-carried tensors instead.
- **The repo runs PreNet dropout at inference on purpose** (`F.dropout(x, p,
  training=True)` hardcoded). Export strips it for determinism and ONNX
  compatibility — a deliberate, documented deviation; quality impact checked at the
  browser smoke.
- Zero is the pad symbol; attention is masked by `(chars != 0)`.
- Synth-side mel (what the Tacotron was trained on and the vocoder consumes): sr
  16000, n_fft 800, hop 200 (12.5 ms), win 800, **80 mels**, fmin 55, fmax 7600,
  pre-emphasis 0.97, symmetric normalisation to ±4 (`max_abs_value = 4`),
  `min_level_db −100`, `ref_level_db 20`.
- Stop condition: decoder stop-token sigmoid > 0.5 on all batch entries (t > 10),
  then trailing frames below −3.4 on the normalised mel scale are trimmed
  (`tts_stop_threshold`).
- Text: `symbols = [_pad="_", _eos="~"] + 64 ASCII chars` (A–Z, a–z, `!'\"(),-.:;?`,
  space) → **66 ids**; `text_to_sequence(text, ["english_cleaners"])`.
- The **postnet is not needed at all**: `generate()` returns `(mels, linear, attn)`
  and the vocoder consumes the **mels** (`mels / 4`). Dropping the postnet CBHG
  removes the largest single subgraph from the export.

### Vocoder (`vocoder/models/fatchord_version.py`, `hparams.py`, `inference.py`)

- WaveRNN, mode RAW, **bits = 9 → 512 classes**, mu-law decode on output; upsample
  scales (5, 5, 8) = hop 200; rnn/fc 512; MelResNet: 10 res blocks, compute 128,
  res_out 128 (aux split into 4 × 32); `voc_pad = 2`.
- `generate` precomputes conditioning **once, in parallel**:
  `pad mel both sides by 2 → UpsampleNetwork → (mels [1, S, 80], aux [1, S, 128])`
  where `S = 200 × T_mel`. Then a strictly sequential per-sample loop over S
  samples (GRUCell ×2 + linears; ~4.07 M MACs/sample ≈ 8.1 MFLOPs).
- Sampling is `Categorical` → **not exportable**; sampling lives in TS (seeded).
  Index → float: `y = 2k/511 − 1`, then mu-law decode
  `x = sign(y)/511 × (512^|y| − 1)`, then de-emphasis IIR
  `out[n] = x[n] + 0.97 × out[n−1]`, trim to `wave_len = (T−1) × 200`, 20-hop
  fade-out.
- Vocoder mel input: the synthesizer's normalised mels **divided by 4**.

### Naive FLOP budget (before measuring — the gate's expectation)

- WaveRNN: ~4.07 M MACs/sample × 16 000 samples/s. One second of audio ≈ 65 GMACs
  ≈ 0.13 TFLOPs. Single-thread wasm (~1–4 GFLOP/s) → **~30–130 s per second of
  audio** — expected to fail the 20 s gate outright; only ~0.5 s utterances could
  even approach it.
- Tacotron step cell: ~17.5 M MACs/step (two 1024-d LSTMCells dominate) × ~80
  frames/s of audio — 4 s of audio ≈ 22 GFLOPs ≈ 6–20 s. Borderline against the 8 s
  budget; the gate decides.
- Encoder: trivial (7 partials × a small LSTM for 4 s of audio).
- The FLOP-inversion that follows: **a parallel vocoder is mandatory** — see §5.

## 2. Export contract (6 graphs, `training/voice/` → `lib/voice` mirror seams)

All graphs: opset 17, batch = 1, eval mode, named I/O, `dynamo=False`. The
contract below is what `lib/voice/modelContract.ts` must mirror exactly.

1. **`voice-encoder.onnx`** — `mel_partial [1, 40, 160]` fp32 (channel-major; the
   graph transposes to the LSTM's (batch, time, 40)) → `embed [1, 256]`
   (L2-normalised). TS owns partial splitting (160-frame slices @ 80-frame step,
   ≥ 0.75 coverage), mean and final L2-normalise. Fixed padding of a short tail
   partial to 160 frames is a small deterministic bias, absorbed by fixtures.
2. **`voice-synth-encode.onnx`** — `text [1, T]` int64 (dynamic T, ≤ 200 symbols)
   + `spk_embed [1, 256]` → `enc_seq [1, T, 512]`, `enc_seq_proj [1, T, 128]`.
   Replicates `Tacotron.encoder` without the in-place `transpose_`, plus
   `encoder_proj`. PreNet dropout stripped.
3. **`voice-synth-step.onnx`** — one decoder step:
   `enc_seq, enc_seq_proj, chars [1, T] int64, prenet_in [1, 80], attn_h [1, 128],
   rnn1_h [1, 1024], rnn2_h [1, 1024], rnn1_c [1, 1024], rnn2_c [1, 1024],
   context [1, 512], cumulative [1, T]` →
   `mel [1, 80, r], stop [1, 1], next_attn_h, next_rnn1_h, next_rnn2_h,
   next_rnn1_c, next_rnn2_c, next_context, next_cumulative, attention [1, T]`.
   **Output states carry a `next_` prefix** — measured checkpoint `r = 2` is baked
   in (JS appends 2 mel frames per step; budget = ceil(max_frames / r)). The
   prefix is load-bearing: the exporter renames producing nodes to the output
   names, so an output named like a loop-carried input collides with it after the
   tracer's duplicate-input merge (`export_synthesizer.py` renames the tracer's
   `attn_h.1`-style duplicate graph inputs back to base names — sometimes the
   dot-free original isn't even in the input list). JS owns the loop, the > 0.5
   stop check (t > 10), the −3.4 trailing-frame trim, and the ≤ 200-symbol cap.
   Dynamic axis T on enc_seq/enc_seq_proj/chars/cumulative/attention.
4. **`voice-voc-upsample.onnx`** — `mel [1, 80, T]` fp32 (dynamic T; normalised
   mels / 4) → `(mels_cond [1, 200T, 80], aux [1, 200T, 128])`. Pads both sides by
   `voc_pad = 2` inside the graph. TS slices `a1..a4 = aux[:, :, 32i : 32(i+1)]`.
5. **`voice-voc-step.onnx`** — one WaveRNN sample (diagnostic/fixture graph, not
   the shipping form):
   `x_prev [1, 1], m_t [1, 80], a1..a4 [1, 32], h1 [1, 512], h2 [1, 512]` →
   `logits [1, 512]`. JS owns sampling (seeded), the index→float→mu-law→
   de-emphasis conversion, the fade-out, and the `wave_len` trim.
6. **`voice-voc-chunk.onnx`** — the **shippable vocoder form** (added during the
   gate): one full mel frame per run, 200 unrolled WaveRNN steps in-graph with
   in-graph gumbel-max sampling
   (`x_prev, m_t, a1..a4, h1, h2, u [200]` → `samples [1, 200] float32, next_h1,
   next_h2, next_x_prev`). JS seeds `u ~ Uniform[0, 1)` per sample (u = 0.5 ⇒
   argmax, used by fixtures); gumbel-max `argmax(logits − log(−log u))` samples
   exactly from the categorical. Mu-law decode + de-emphasis stay in TS
   (vectorised after all frames). Rationale: the per-sample JS loop measured
   0.4–0.5 ms/sample ≈ 22–33 s per 4 s of audio — mostly JS↔wasm run overhead
   (64 000 runs/s); unrolling one mel frame (the conditioning-constant length)
   amortises that 200× → 320 runs per 4 s, ~10–16 s.

TS-side mirror seams with golden fixtures (Milestone B, chess
`verify:chess-model` pattern): encoder mel (power-mel 40-bin path), synthesizer
mel (80-band, preemph, ±4 normalised path — needed only if/when fixtures must
derive mels in TS), text → symbol ids (66-symbol table), end-to-end embedding
parity.

## 3. Gate procedure (Milestone A)

1. **Exports ran locally on the Windows machine, not the Mac** (user-directed;
   the Mac never came into play): Python 3.14 venv at `training/voice/.venv`
   (torch 2.14.0+cpu, onnxruntime 1.29.0, librosa 1.0.0, numpy 2.5.2), the three
   HF checkpoints in `training/voice/pretrained/`, `export_*.py` → fp32 +
   `voice-voc-chunk.onnx` in `training/voice/export/` (~110 MB total, gitignored).
2. `npm run smoke:voice` (`scripts/smoke-voice-ort.ts`, tsx, ORT-web wasm
   backend, `numThreads = 1` — the same backend the browser uses): loads all six
   graphs, runs synthetic-input stages, prints per-stage ms and extrapolations.
3. `app/voice/smoke` (temporary, noindex): the same flow inside a **Web Worker**
   in real Chrome (driven headless via playwright-core + system Chrome from a
   throwaway script outside the repo).

Thresholds (unchanged from the plan): all graphs load; encoder < 1 s on 4 s audio;
Tacotron < 8 s on ~10 words; vocoder < 20 s (make-or-break); end-to-end < ~45 s on
a mid laptop before any UI work.

### Measured numbers (2026-09-07, Windows 11 dev machine — NOT a mid laptop;
Safari row pending James)

| stage | metric | threshold | measured (tsx) | measured (Chrome) |
|---|---|---|---|---|
| load | 6 graphs load under wasm | pass/fail | pass | pass |
| encoder | 7 partials (4 s audio) | < 1 s | 11.7–12.8 ms/partial → 82–90 ms | 11.9 ms/partial → 83 ms |
| synth encode | one encode pass, T = 50 | — | 11.7–12.7 ms | 12.3 ms |
| synth step | per-step ms × ~640 steps (10 words) | < 8 s total | 2.0–2.8 ms/step → 1.3–1.8 s | 2.05 ms/step → 1.31 s |
| voc upsample | one pass, T = 32 frames | — | 11.6–12.3 ms | 11.2 ms |
| voc step (baseline) | per-sample ms → 4 s audio | diagnostic | 0.4–0.5 ms → 23–33 s | 0.4 ms → ~23 s |
| voc chunk (shipping form) | per-frame ms × 320 frames (4 s audio) | < 20 s @ 4 s | 32.6–38 ms → 10.4–12.2 s | 49.5 ms → 15.8 s |
| end-to-end | synth (10 words) + vocoder (4 s) | < 45 s | ~12–14 s | ~17 s |

**GATE: PASSED** — all thresholds met with margin on both backends, zero console
errors in Chrome. int8 candidates (built, CPU-ORT smoke-tested) measured no slower
than fp32 per-sample (wasm has no int8 advantage here); their value is download
size (§4/§5).

## 4. Fallback ladder (revised twice — research + measurement)

1. **WaveRNN chunked — now the PRIMARY path, gate-passed.** §1's FLOP budget
   predicted ~30–130 s per second of audio and a certain fail; the measurement
   inverted it. MLAS wasm SIMD runs the per-sample step at ~0.4 ms, and the
   mel-frame chunk graph (§2.6) lands at ~10–16 s per 4 s of audio — inside the
   20 s gate. Quality check (real speech listening test) is Milestone C work;
   Griffin-Lim (5) remains the guaranteed floor.
2. **HiFi-GAN — demoted to *probe*.** The plan assumed pretrained HiFi-GAN
   weights for SV2TTS mels exist; they don't in any official form. NVIDIA's
   universal checkpoints use different mel scaling (fmin 0, no pre-emphasis,
   different normalisation) and produce noise on SV2TTS mels (CorentinJ issue
   #1035). The one ready-made candidate is raccoonML's MLRTVC-v1
   (`github.com/raccoonML/hifigan-demo`, release MLRTVC-v1) — trained on
   RTVC-style mels, explicitly "not production quality" (150k steps). Only
   relevant now if the chunked WaveRNN listening test disappoints.
3. **int8 dynamic quantization — works, fp16 does not.** All six graphs
   int8-quantized and CPU-ORT smoke-tested (encoder 5.5→1.4 MB, synth-encode
   12.6→4.1 MB, synth-step 74.6→18.7 MB, voc-upsample 1.6→0.5 MB, voc-step
   15.6→3.9 MB — chunk TBD). fp16 conversion via onnxconverter-common FAILS on
   these RNN-heavy graphs (GRU/LSTM are in its default op block list → mixed-type
   MatMul/Gemm on load); fp16 buys no wasm speed anyway, so int8 is the shipping
   compression.
4. **Shorter max utterance** — the honest lever if the listening test or Safari
   numbers disappoint: cap synthesis at ~1.5–2 s per run, sentence-chunked.
   (Chrome numbers already pass; this is Safari insurance.)
5. **Griffin-Lim vocoder in TS**: the repo ships it (`griffin_lim_iters = 60`);
   pure FFT signal processing, deterministic, zero artifacts. Quality is famously
   "underwater/robotic" but intelligible — the **guaranteed browser-viable floor**
   that keeps the project `interactive: true` if the WaveRNN listening test
   fails.
6. **Pre-generated demo clips, `interactive: false`** — documented last resort
   (unchanged from the plan).

## 5. Open concerns flagged to James (2026-09-06; updated 2026-09-07 after the gate)

1. **Artifact size**: fp32 total ≈ 110 MB; int8 ≈ 29 MB (before the chunk graph
   is quantized). Milestone B gates int8 numerics (cosine/max-Δ against fp32,
   `training/voice/gate.py`) and promotes the winners to `public/models/`;
   LFS decision still pending before those commits.
2. **WaveRNN viability — resolved by measurement, one caveat**: speed passes
   (§3); *audio quality* of the chunked in-graph gumbel sampling + stripped
   PreNet dropout is unverified until a real listening test (Milestone C). The
   FLOP budget in §1 was 10–30× too pessimistic — MLAS wasm SIMD is far faster
   than the 1–4 GFLOP/s guess.
3. **Inference-time PreNet dropout stripped** for deterministic export — small
   quality risk, folded into the same listening test.
4. **Safari untested** (no macOS here). WebKit wasm SIMD should track Chrome's
   numbers, but the gate table keeps a Safari column for James to fill on the
   Mac; fallback ladder item 4 is the insurance.
5. **Exports ran on Windows, not the Mac** — fine for conversion (CPU-only,
   deterministic), but James should know `training/voice/` now has a working
   Windows path (venv + checkpoints + exports are all machine-local and
   gitignored).