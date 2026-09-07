# Voice cloning conversion pipeline (`training/voice/`)

Converts the SV2TTS pretrained checkpoints (CorentinJ/Real-Time-Voice-Cloning,
**PyTorch — not TensorFlow**) to browser-ready ONNX artifacts. **Runs on James's
Mac only — never on Vercel** (same rule as `training/`). The design, contract,
and gate numbers live in `docs/notes/voice-cloning-architecture.md`.

## State

- **Milestone A gate PASSED** (2026-09-07, tsx + real Chrome) — see §3 of
  `docs/notes/voice-cloning-architecture.md`.
- **Milestone B complete** (2026-09-07): fixtures + wasm verifier + quantization
  gate; the shipping artifacts are the **fp32 exports** (see "Compression" —
  both the int8 and fp16 ladders fail on these RNN-heavy graphs). The gated
  artifacts are committed at `public/models/voice/`.
- **Voc-chunk re-exported** (2026-09-07, post-gate bugfix): the shipped chunk
  graph froze the GRU state and its gumbel-max used one scalar `u` per sample
  (a constant across all 512 logits can never change an argmax — see the
  postmortem in `docs/notes/voice-cloning-architecture.md` §2). The re-export
  loops h1/h2 in-graph and takes per-class `u [200, 512]`; TS side and fixtures
  were updated in lockstep and the 52/52 wasm gate re-passed with non-degenerate
  vocoder values.

## Milestone B pipeline (after every re-export)

```bash
# 1. Fixtures (venv): golden text/mel/embed/graph values for the TS verifier.
python make_fixtures.py                       # writes fixtures/voice_fixtures.json

# 2. TS parity verifier (repo root) — every constant and chained step in
#    lib/voice/ must reproduce the Python-side values through ORT-web wasm.
npm run verify:voice-model

# 3. Quantization candidates + gate (int8 dynamic; fp16 fails — see below).
python quantize.py --export-dir export --formats int8
python gate.py --export-dir export            # compares candidates vs fp32
```

## Compression

Both compression ladders **fail** on the SV2TTS graphs (measured 2026-09-07):

- **int8 dynamic** — converts and loads, but accuracy collapses:
  `DynamicQuantizeLSTM` scrambles the encoder embedding (cosine 0.38 vs fp32
  on a real mel slice), and even the non-LSTM `synth-encode` lands at cosine
  0.997 with a 0.04 mean delta in attention space. All candidates REJECT in
  `gate.py`. Kept as tooling (`quantize.py`/`gate.py`) for a future static-
  quantization-with-calibration attempt.
- **fp16** — `onnxconverter-common` cannot convert the LSTM/GRU graphs at all
  (mixed-type MatMul/Gemm on load), and a targeted RNN-only fp16 conversion
  (Gemm/MatMul kept fp32) saves almost nothing: the CBHG convs and the vocoder
  conv stack dominate those files. fp16 also buys no wasm speed.
- **Decision: ship fp32** — encoder 5.5 MB, synth-encode 12.6 MB, synth-step
  74.6 MB, voc-upsample 1.6 MB, voc-chunk 17.4 MB ≈ 111 MB total, lazy-loaded
  per stage. `voice-voc-step.onnx` is diagnostic-only and not shipped.

## Mac setup

```bash
# 1. Python venv (3.9–3.10 is what the reference repo expects; torch 2.x works
#    for export with the classic tracer).
python3 -m venv .venv && source .venv/bin/activate
pip install torch onnxruntime numpy

# 2. Reference repo (already cloned at _rtvc-src for study; scripts require it).
git clone --depth 1 https://github.com/CorentinJ/Real-Time-Voice-Cloning _rtvc-src
#    The repo's own requirements pull librosa/webrtcvad etc. — the export
#    scripts only import the model modules, so torch + the repo source suffice.

# 3. Pretrained checkpoints (HuggingFace CorentinJ/SV2TTS):
#    encoder.pt (17 MB), synthesizer.pt (371 MB), vocoder.pt (54 MB)
mkdir -p pretrained && cd pretrained
curl -LO https://huggingface.co/CorentinJ/SV2TTS/resolve/main/encoder.pt
curl -LO https://huggingface.co/CorentinJ/SV2TTS/resolve/main/synthesizer.pt
curl -LO https://huggingface.co/CorentinJ/SV2TTS/resolve/main/vocoder.pt
cd ..

# 4. Export (fp32, opset 17, fixed/named I/O):
python export_encoder.py --checkpoint pretrained/encoder.pt \
    --out export/voice-encoder.onnx
python export_synthesizer.py --checkpoint pretrained/synthesizer.pt --outdir export
python export_vocoder.py --checkpoint pretrained/vocoder.pt --outdir export
```

Outputs land in `export/` (gitignored — never commit raw exports; gated,
quantized artifacts are promoted to `public/models/` under their committed
names, as with chess).

## Gate smoke (wasm — run from the repo root, any machine)

```bash
npm run smoke:voice        # tsx + ORT-web wasm, same backend as the browser
```

The five shipped fp32 exports are committed at `public/models/voice/` — after
a re-export, copy the five runtime graphs (not `voice-voc-step`) over them:

```bash
cp export/voice-encoder.onnx export/voice-synth-encode.onnx \
   export/voice-synth-step.onnx export/voice-voc-upsample.onnx \
   export/voice-voc-chunk.onnx ../../public/models/voice/
```

## Files (Milestone A scope)

| file | purpose |
|---|---|
| `export_encoder.py` | partial-embedding graph: `[1, 40, 160]` → `[1, 256]` |
| `export_synthesizer.py` | Tacotron → `synth-encode` (per-utterance) + `synth-step` (per-step decoder cell; `r` baked from checkpoint) |
| `export_vocoder.py` | WaveRNN → `voc-upsample` (parallel conditioning, dynamic T) + `voc-step` (single-sample cell, diagnostic) + `voc-chunk` (200 unrolled samples with per-sample conditioning and in-graph gumbel-max) |
| `mel_ref.py` | librosa reference for both mel paths (encoder power mel, synth magnitude + dB + ±4) |
| `clean_text.py` | `english_cleaners` + `text_to_sequence` reference + TEXT_CASES |
| `make_fixtures.py` | generates the deterministic fixture wavs + the golden text/mel/embed/graph JSON |
| `quantize.py` / `gate.py` | int8/fp16 candidates + candidate-vs-fp32 gate |
| `ground_truth.py` | reference-pipeline vs ONNX stage comparison (reference Tacotron mel vs ONNX mel, reference `model.generate` on the ONNX mel) — the check that caught the shipped voc-chunk producing a DC ramp |
| `synthesize_sample.py` | listening-test sample generator: real reference-repo speakers → shipped graphs (mirroring `lib/voice/engine.ts` step for step) → A/B WAVs (WaveRNN random-u / argmax / Griffin-Lim) with speech-sanity diagnostics; outputs to `samples/` (gitignored) |
| `fixtures/` | committed fixture wavs + `voice_fixtures.json` (checked by `npm run verify:voice-model`) |
| `_rtvc-src/` | reference repo clone (gitignored, read-only for study) |
| `pretrained/` | downloaded checkpoints (gitignored) |
| `export/` | raw fp32 ONNX outputs (gitignored) |