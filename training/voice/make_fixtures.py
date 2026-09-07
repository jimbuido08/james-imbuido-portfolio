"""Generate the voice parity fixtures (training/voice/fixtures/, committed).

voice_fixtures.json — three parity sections the TypeScript side must reproduce
(`npm run verify:voice-model` checks them):
  text_cases    — symbol-id sequences from clean_text.py TEXT_CASES
  mel_cases     — encoder + synthesizer mel digests for deterministic fixture
                  wavs (plus frame counts)
  embed_cases   — the reference repo's PyTorch speaker-encoder embedding for
                  each fixture wav (the ONNX/TS pipeline must reproduce it
                  within fp16 tolerance)

The fixture wavs are deterministic synthetic signals (seeded chirp + noise
mixtures, 2 s and 4 s) — they are for numeric parity, not voice quality. A
real recording for human-ear checks can be dropped in as james-sample.wav
(kept out of fixtures JSON; quality checks are manual).

Requires: the venv (mel + text), the reference repo (text + torch), and
pretrained/encoder.pt for the embedding section. The fp32 ONNX export is not
needed here — the reference is the raw PyTorch model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

import mel_ref

RTVC = Path(__file__).resolve().parent / "_rtvc-src"
import sys

if not RTVC.is_dir():
    raise SystemExit(
        "reference repo missing — clone CorentinJ/Real-Time-Voice-Cloning to "
        f"{RTVC} (see README.md)"
    )
sys.path.insert(0, str(RTVC))

SR = 16000


def write_wav(path: Path, samples: np.ndarray) -> None:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    data = pcm.tobytes()
    header = b"RIFF" + struct.pack(
        "<I4s4sIHHIIHH4sI",
        36 + len(data),
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM
        1,  # mono
        SR,
        SR * 2,  # byte rate
        2,  # block align
        16,  # bits
        b"data",
        len(data),
    )
    path.write_bytes(header + data)


def read_wav(path: Path) -> np.ndarray:
    raw = path.read_bytes()
    assert raw[:4] == b"RIFF" and raw[36:40] == b"data", "unexpected wav layout"
    pcm = np.frombuffer(raw[44:], dtype="<i2")
    return pcm.astype(np.float64) / 32767.0


def generate_fixture_wavs(fixtures_dir: Path) -> list[Path]:
    """Deterministic synthetic speech-like signals (seeded, never random)."""
    wavs = []
    for name, seconds in (("tone-2s.wav", 2.0), ("tone-4s.wav", 4.0)):
        t = np.arange(int(seconds * SR)) / SR
        # Amplitude-modulated chirp with syllable-ish pauses.
        sweep = np.sin(2 * np.pi * (180 + 60 * t) * t)
        envelope = 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)
        rng = np.random.RandomState(20260906)
        noise = rng.randn(len(t)) * 0.05
        samples = sweep * envelope + noise
        path = fixtures_dir / name
        write_wav(path, samples)
        wavs.append(path)
    return wavs


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def embed_cases(fixtures_dir: Path, wavs: list[Path]) -> dict | None:
    """PyTorch encoder reference embeddings via embed_utterance's logic."""
    checkpoint = Path(__file__).parent / "pretrained" / "encoder.pt"
    if not checkpoint.exists():
        print("[fixtures] pretrained/encoder.pt absent — embed_cases skipped")
        return None

    import torch

    from encoder.model import SpeakerEncoder
    from encoder.inference import compute_partial_slices

    device = torch.device("cpu")
    model = SpeakerEncoder(device, torch.device("cpu"))
    state = torch.load(checkpoint, map_location=device, weights_only=False)
    model.load_state_dict(state["model_state"])
    model.eval()

    cases = {}
    for wav_path in wavs:
        wav = read_wav(wav_path)
        wave_slices, mel_slices = compute_partial_slices(
            len(wav), partial_utterance_n_frames=160
        )
        mel = mel_ref.encoder_mel(wav)
        partial_embeds = []
        for s in mel_slices:
            partial = mel[s]
            if partial.shape[0] < 160:
                padded = np.zeros((160, 40), np.float32)
                padded[: partial.shape[0]] = partial
                partial = padded
            with torch.no_grad():
                embeds = model(torch.from_numpy(partial[None]).float())
            partial_embeds.append(embeds[0].numpy())
        raw_embed = np.mean(partial_embeds, axis=0)
        embed = raw_embed / np.linalg.norm(raw_embed, 2)
        cases[wav_path.name] = {
            "n_partials": len(partial_embeds),
            "embed": [round(float(v), 6) for v in embed],
        }
    return cases


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures-dir", type=Path, default=Path(__file__).parent / "fixtures"
    )
    args = parser.parse_args()
    args.fixtures_dir.mkdir(parents=True, exist_ok=True)

    from clean_text import TEXT_CASES, clean_and_sequence

    text_cases = [
        {"text": text, "ids": clean_and_sequence(text)}
        for text in TEXT_CASES
    ]

    wavs = generate_fixture_wavs(args.fixtures_dir)
    mel_cases = []
    for wav_path in wavs:
        wav = read_wav(wav_path)
        enc_mel = mel_ref.encoder_mel(wav)
        syn_mel = mel_ref.synth_mel(wav)
        mel_cases.append(
            {
                "wav": wav_path.name,
                "seconds": round(len(wav) / SR, 3),
                "encoder_mel": {
                    "frames": int(enc_mel.shape[0]),
                    "bins": int(enc_mel.shape[1]),
                    "sha256": sha(np.ascontiguousarray(enc_mel).tobytes()),
                },
                "synth_mel": {
                    "frames": int(syn_mel.shape[1]),
                    "bins": int(syn_mel.shape[0]),
                    "sha256": sha(np.ascontiguousarray(syn_mel.T).tobytes()),
                },
            }
        )

    fixture = {
        "mel_cases": mel_cases,
        "text_cases": text_cases,
    }
    embeds = embed_cases(args.fixtures_dir, wavs)
    if embeds is not None:
        fixture["embed_cases"] = embeds

    out = args.fixtures_dir / "voice_fixtures.json"
    out.write_text(json.dumps(fixture, indent=2))
    print(f"[fixtures] wrote {out.name}: {len(text_cases)} text cases, "
          f"{len(mel_cases)} mel cases, "
          f"{len(embeds) if embeds else 0} embed cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())