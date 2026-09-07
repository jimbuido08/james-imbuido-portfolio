"""Generate the voice parity fixtures (training/voice/fixtures/, committed).

voice_fixtures.json — four parity sections the TypeScript side must reproduce
(`npm run verify:voice-model` checks them):

  text_cases   — symbol-id sequences from clean_text.py TEXT_CASES
  mel_cases    — encoder + synthesizer mel VALUES (tone-2s, 5 significant
                 digits, frames-major) for the deterministic fixture wavs;
                 tone-4s carries frame counts only (its full pipeline is
                 covered end-to-end by embed_cases)
  embed_cases  — the reference repo's PyTorch speaker-encoder embedding for
                 each fixture wav (the ONNX/TS pipeline must reproduce it
                 within tolerance)
  graph_cases  — golden outputs of the fp32 ONNX graphs, computed with CPU ORT
                 exactly as the TS verifier will (same inputs, same chaining):
                 synth-encode on the first text case + the fixture speaker
                 embedding, 12 chained synth-step runs from zero state, and 4
                 chained voc-chunk frames (u = 0.5 argmax path) over a 32-frame
                 slice of the tone-2s synth mel / 4.

The fixture wavs are deterministic synthetic signals (seeded chirp + noise
mixtures, 2 s and 4 s) — they are for numeric parity, not voice quality. A
real recording for human-ear checks can be dropped in as james-sample.wav
(kept out of fixtures JSON; quality checks are manual).

Values are stored rounded to 5 significant digits (not sha digests): the TS
side re-derives the same tensors with a different FFT/BLAS stack, so bit-exact
hashes would flip on rounding-boundary values, while element-wise comparison
against rounded references with a relative tolerance is robust and debuggable.

Requires: the venv (mel + text + torch), the reference repo (text + torch),
pretrained/{encoder,synthesizer,vocoder}.pt, and export/*.onnx (fp32) for the
graph golden section.
"""

from __future__ import annotations

import argparse
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

# Speaker-encoder constants (mirror lib/voice/modelContract.ts).
PARTIAL_FRAMES = 160
PARTIAL_STEP = 80
EMBED_SIZE = 256


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


def round5(values) -> list[list[float]]:
    """5 significant digits, frames-major — the JSON storage format."""
    return [[float(f"{v:.4e}") for v in row] for row in values]


def fixture_speaker_embedding() -> np.ndarray:
    """Mirror of fixtureSpeakerEmbedding() in lib/voice/modelContract.ts."""
    i = np.arange(EMBED_SIZE)
    raw = np.sin((i + 1) * 0.1237) + np.cos(i * 0.031)
    return (raw / np.linalg.norm(raw, 2)).astype(np.float32)


def mel_cases(wavs: list[Path]) -> list[dict]:
    cases = []
    for wav_path in wavs:
        wav = read_wav(wav_path)
        enc_mel = mel_ref.encoder_mel(wav)  # (T, 40) frames-major
        syn_mel = mel_ref.synth_mel(wav)  # (80, T) bins-major
        case = {
            "wav": wav_path.name,
            "seconds": round(len(wav) / SR, 3),
            "encoder_mel": {
                "frames": int(enc_mel.shape[0]),
                "bins": int(enc_mel.shape[1]),
            },
            "synth_mel": {
                "frames": int(syn_mel.shape[1]),
                "bins": int(syn_mel.shape[0]),
            },
        }
        if wav_path.name == "tone-2s.wav":
            case["encoder_mel"]["values"] = round5(enc_mel)
            case["synth_mel"]["values"] = round5(syn_mel.T)
        cases.append(case)
    return cases


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
            len(wav), partial_utterance_n_frames=PARTIAL_FRAMES
        )
        mel = mel_ref.encoder_mel(wav)
        partial_embeds = []
        for s in mel_slices:
            partial = mel[s]
            if partial.shape[0] < PARTIAL_FRAMES:
                padded = np.zeros((PARTIAL_FRAMES, 40), np.float32)
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


def graph_cases(export_dir: Path, wav_paths: dict[str, Path],
                text_ids: list[int]) -> dict | None:
    """Golden outputs from the fp32 ONNX graphs (CPU ORT), mirroring exactly
    the chained runs the TS verifier performs. None when exports are absent
    (the fixtures stay committable without them)."""
    fp32 = export_dir / "voice-synth-encode.onnx"
    if not fp32.exists():
        print("[fixtures] export/*.onnx absent — graph_cases skipped")
        return None

    import onnxruntime as ort

    providers = ["CPUExecutionProvider"]
    encode = ort.InferenceSession(str(export_dir / "voice-synth-encode.onnx"), providers=providers)
    step = ort.InferenceSession(str(export_dir / "voice-synth-step.onnx"), providers=providers)
    upsample = ort.InferenceSession(str(export_dir / "voice-voc-upsample.onnx"), providers=providers)
    chunk = ort.InferenceSession(str(export_dir / "voice-voc-chunk.onnx"), providers=providers)

    spk = fixture_speaker_embedding()[None]
    text = np.asarray([text_ids], dtype=np.int64)
    enc_seq, enc_seq_proj = encode.run(None, {"text": text, "spk_embed": spk})

    # Decoder loop from Tacotron.generate's zero initial state: go frame,
    # zero hidden/cell/context, zero cumulative attention.
    t = text.shape[1]
    state = {
        "enc_seq": enc_seq,
        "enc_seq_proj": enc_seq_proj,
        "chars": text,
        "prenet_in": np.zeros((1, 80), np.float32),
        "attn_h": np.zeros((1, 128), np.float32),
        "rnn1_h": np.zeros((1, 1024), np.float32),
        "rnn2_h": np.zeros((1, 1024), np.float32),
        "rnn1_c": np.zeros((1, 1024), np.float32),
        "rnn2_c": np.zeros((1, 1024), np.float32),
        "context": np.zeros((1, 512), np.float32),
        "cumulative": np.zeros((1, t), np.float32),
    }
    step_cases = []
    for _ in range(12):
        mel, stop, *rest = step.run(None, state)
        (next_attn_h, next_rnn1_h, next_rnn2_h, next_rnn1_c, next_rnn2_c,
         next_context, next_cumulative, _attention) = rest
        step_cases.append({
            "mel": round5(mel[0].T),  # (r, 80) -> (80, r) frames-major flat rows
            "stop": round5(stop),
        })
        state.update({
            "prenet_in": mel[:, :, -1].copy(),
            "attn_h": next_attn_h,
            "rnn1_h": next_rnn1_h,
            "rnn2_h": next_rnn2_h,
            "rnn1_c": next_rnn1_c,
            "rnn2_c": next_rnn2_c,
            "context": next_context,
            "cumulative": next_cumulative,
        })

    # Vocoder golden: 32-frame slice of the tone-2s synth mel / 4, 4 chained
    # chunk frames with u = 0.5 (argmax path), zero RNN state — exactly what
    # the TS verifier derives from its own synthMel.
    wav = read_wav(wav_paths["tone-2s.wav"])
    syn_mel = mel_ref.synth_mel(wav)  # (80, T)
    mel32 = syn_mel[:, :32] / 4.0
    mels_cond, aux = upsample.run(None, {"mel": mel32[None].astype(np.float32)})
    h1 = np.zeros((1, 512), np.float32)
    h2 = np.zeros((1, 512), np.float32)
    x_prev = np.zeros((1, 1), np.float32)
    # u = 0.5 per (sample, class): constant per-class gumbel vector -> the
    # deterministic argmax path. The chunk's u input is [200, 512].
    u = np.full((200, 512), 0.5, np.float32)
    frame_cases = []
    for i in range(4):
        lo, hi = i * 200, (i + 1) * 200
        samples, h1, h2, x_prev = chunk.run(None, {
            "x_prev": x_prev,
            "mels": mels_cond[0, lo:hi],
            "aux": aux[0, lo:hi],
            "h1": h1,
            "h2": h2,
            "u": u,
        })
        frame_cases.append({
            "samples": [int(v) for v in samples[0]],
        })

    return {
        "synth_encode": {
            "text": [int(v) for v in text_ids],
            "enc_seq": round5(enc_seq[0]),
            "enc_seq_proj": round5(enc_seq_proj[0]),
        },
        "synth_steps": step_cases,
        "voc_frames": frame_cases,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures-dir", type=Path, default=Path(__file__).parent / "fixtures"
    )
    parser.add_argument(
        "--export-dir", type=Path, default=Path(__file__).parent / "export"
    )
    args = parser.parse_args()
    args.fixtures_dir.mkdir(parents=True, exist_ok=True)

    from clean_text import TEXT_CASES, clean_and_sequence

    text_cases = [
        {"text": text, "ids": clean_and_sequence(text)}
        for text in TEXT_CASES
    ]

    wavs = generate_fixture_wavs(args.fixtures_dir)
    wav_paths = {p.name: p for p in wavs}

    fixture = {
        "mel_cases": mel_cases(wavs),
        "text_cases": text_cases,
    }
    embeds = embed_cases(args.fixtures_dir, wavs)
    if embeds is not None:
        fixture["embed_cases"] = embeds
    graphs = graph_cases(args.export_dir, wav_paths, text_cases[0]["ids"])
    if graphs is not None:
        fixture["graph_cases"] = graphs

    out = args.fixtures_dir / "voice_fixtures.json"
    out.write_text(json.dumps(fixture, indent=2))
    size_kb = out.stat().st_size / 1024
    print(f"[fixtures] wrote {out.name} ({size_kb:.0f} KB): "
          f"{len(text_cases)} text cases, {len(fixture['mel_cases'])} mel cases, "
          f"{len(embeds) if embeds else 0} embed cases, "
          f"{'graph cases' if graphs else 'no graph cases'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())