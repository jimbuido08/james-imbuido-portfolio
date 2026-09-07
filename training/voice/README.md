# Voice cloning conversion pipeline (`training/voice/`)

Converts the SV2TTS pretrained checkpoints (CorentinJ/Real-Time-Voice-Cloning,
**PyTorch — not TensorFlow**) to browser-ready ONNX artifacts. **Runs on James's
Mac only — never on Vercel** (same rule as `training/`). The design, contract,
and gate numbers live in `docs/notes/voice-cloning-architecture.md`.

## State

- Milestone A (feasibility gate): the `export_*.py` scripts here are the
  throwaway exports; `scripts/smoke-voice-ort.ts` (repo root) is the wasm
  smoke; `app/voice/smoke` is the temporary browser smoke. Nothing ships until
  the gate numbers pass.

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

For the temporary browser smoke (`app/voice/smoke`), copy the fp32 exports to
`public/models/` under their shipped names:

```bash
cp export/voice-encoder.onnx ../../public/models/
cp export/voice-synth-encode.onnx export/voice-synth-step.onnx \
   export/voice-voc-upsample.onnx export/voice-voc-step.onnx ../../public/models/
```

## Files (Milestone A scope)

| file | purpose |
|---|---|
| `export_encoder.py` | partial-embedding graph: `[1, 40, 160]` → `[1, 256]` |
| `export_synthesizer.py` | Tacotron → `synth-encode` (per-utterance) + `synth-step` (per-step decoder cell; `r` baked from checkpoint) |
| `export_vocoder.py` | WaveRNN → `voc-upsample` (parallel conditioning) + `voc-step` (single sample cell) |
| `_rtvc-src/` | reference repo clone (gitignored, read-only for study) |
| `pretrained/` | downloaded checkpoints (gitignored) |
| `export/` | raw fp32 ONNX outputs (gitignored) |

Milestone B adds: `quantize.py`, `make_fixtures.py`, `gate.py`, `mel_ref.py`,
`clean_text.py`, `fixtures/` (committed 2–5 s wavs), and the fp16/int8 promotion
pipeline — only after the Milestone A gate passes.