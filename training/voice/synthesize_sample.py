"""Listening-test sample generator for /voice (runs on James's machine only).

The Milestone C browser drive proved the plumbing but nobody has *listened*
to the output yet — and the fixtures only ever exercised the u = 0.5 argmax
path on 4 voc-chunk frames. This script closes both gaps as far as a machine
can: it runs the shipped fp32 graphs over a REAL speech clip from the
reference repo's samples/ (so the embedding is a genuine voice, not a tone),
mirrors lib/voice/engine.ts step for step (decoder loop, stop/trim, voc-chunk
with seeded random u, mu-law decode, de-emphasis, wave_len trim, fade), and
writes A/B WAVs plus objective speech-sanity diagnostics:

  - WaveRNN with seeded random u   (the shipping sampling path)
  - WaveRNN with u = 0.5 argmax    (the fixture path, for comparison)
  - Griffin-Lim on the same mel    (the guaranteed floor, fallback ladder 5)

The diagnostics check the random-u path produces speech-like audio: nonzero
voiced fraction, a sane amplitude envelope, and per-frame energy correlation
with the requested mel. What no script can decide is whether it sounds GOOD —
that judgment, plus the real-browser flow, stays with James.

Usage (venv):
    PYTHONIOENCODING=utf-8 ./.venv/Scripts/python.exe synthesize_sample.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import librosa
import numpy as np
import onnxruntime as ort
from scipy.signal import lfilter

HERE = Path(__file__).parent
SAMPLES_OUT = HERE / "samples"
SR = 16000
PARTIAL_FRAMES = 160
PARTIAL_STEP = 80
MIN_PAD_COVERAGE = 0.75
STOP_THRESHOLD = 0.5
MIN_STOP_FRAMES = 10
TRIM_THRESHOLD = -3.4
VOC_HOP = 200
FADE = 20 * VOC_HOP
SEED = 20260907

TEXT = "This voice was cloned entirely in a web browser, and the recording never left the device."


def compute_partial_slices(n_samples: int) -> list[tuple[int, int]]:
    """Port of lib/voice/partialSlices.ts (verified against the reference by
    the fixture gate): 160-frame partials at 80-frame step, tail dropped when
    padded coverage would fall below 75%."""
    samples_per_frame = 160 // 1  # encoder hop at 16 kHz
    n_frames = -(-(n_samples + 1) // samples_per_frame)
    steps = max(1, n_frames - PARTIAL_FRAMES + PARTIAL_STEP + 1)
    slices = [(i, i + PARTIAL_FRAMES) for i in range(0, steps, PARTIAL_STEP)]
    start, stop = slices[-1]
    coverage = (n_samples - start * samples_per_frame) / (
        (stop - start) * samples_per_frame
    )
    if coverage < MIN_PAD_COVERAGE and len(slices) > 1:
        slices.pop()
    return slices


def embed_utterance(encoder: ort.InferenceSession, wav: np.ndarray) -> np.ndarray:
    """The shipped encoder graph over librosa-exact mels — the browser path."""
    mel = mel_ref.encoder_mel(wav)  # (T, 40) frames-major
    partials = []
    for start, stop in compute_partial_slices(len(wav)):
        partial = mel[start:stop]
        if partial.shape[0] < PARTIAL_FRAMES:
            padded = np.zeros((PARTIAL_FRAMES, 40), np.float32)
            padded[: partial.shape[0]] = partial
            partial = padded
        # Channel-major [1, 40, 160] graph input.
        out = encoder.run(None, {"mel_partial": partial.T[None].astype(np.float32)})
        partials.append(out[0][0])
    raw = np.mean(partials, axis=0)
    return (raw / np.linalg.norm(raw, 2)).astype(np.float32)


def decode_mel(step, encode_out, text: np.ndarray, max_frames: int = 800) -> np.ndarray:
    """Tacotron.generate: zero init, r=2 frames per step, >0.5 stop (t > 10),
    then the -3.4 dB trailing trim. Returns (T, 80) frames-major."""
    enc_seq, enc_seq_proj = encode_out
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
    frames = []
    produced = 0
    for _ in range(max_frames // 2):
        mel, stop, *rest = step.run(None, state)
        (next_attn_h, next_rnn1_h, next_rnn2_h, next_rnn1_c, next_rnn2_c,
         next_context, next_cumulative, _attention) = rest
        frames.append(mel[0].T)  # (r, 80) -> frames
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
        produced += mel.shape[2]
        if float(stop[0, 0]) > STOP_THRESHOLD and produced > MIN_STOP_FRAMES:
            break
    mels = np.concatenate(frames, axis=0)  # (T, 80)
    while mels.shape[0] > 1 and float(np.max(mels[-1])) < TRIM_THRESHOLD:
        mels = mels[:-1]
    return mels


def vocode(upsample, chunk, mel_norm: np.ndarray, u_mode: str,
           seed: int = SEED) -> np.ndarray:
    """WaveRNN.generate with the chunk graph: one mel frame per run, 200
    unrolled samples with in-graph gumbel-max sampling."""
    mels_cond, aux = upsample.run(
        None, {"mel": (mel_norm / 4.0).T[None].astype(np.float32)}
    )
    rng = np.random.RandomState(seed)
    h1 = np.zeros((1, 512), np.float32)
    h2 = np.zeros((1, 512), np.float32)
    x_prev = np.zeros((1, 1), np.float32)
    codes = np.empty((mel_norm.shape[0], VOC_HOP), np.float32)
    VOC_CLASSES = 512
    for frame in range(mel_norm.shape[0]):
        if u_mode == "argmax":
            u = np.full((VOC_HOP, VOC_CLASSES), 0.5, np.float32)
        else:
            # independent uniform per (sample, class) — gumbel-max needs it
            u = rng.uniform(1e-3, 1 - 1e-3, (VOC_HOP, VOC_CLASSES)).astype(
                np.float32
            )
        lo, hi = frame * VOC_HOP, (frame + 1) * VOC_HOP
        samples, h1, h2, x_prev = chunk.run(None, {
            "x_prev": x_prev,
            "mels": mels_cond[0, lo:hi],
            "aux": aux[0, lo:hi],
            "h1": h1,
            "h2": h2,
            "u": u,
        })
        codes[frame] = samples[0]

    # Output conversion: index -> y -> mu-law decode -> de-emphasis -> trim/fade.
    y = 2.0 * codes.reshape(-1) / 511.0 - 1.0
    x = np.sign(y) / 511.0 * (np.power(512.0, np.abs(y)) - 1.0)
    audio = lfilter([1.0], [1.0, -0.97], x).astype(np.float32)
    wave_len = (mel_norm.shape[0] - 1) * VOC_HOP
    audio = audio[:wave_len]
    audio[-FADE:] *= np.linspace(1.0, 0.0, FADE, dtype=np.float32)
    return audio


def diagnostics(audio: np.ndarray, requested_mel: np.ndarray) -> dict:
    """Speech-sanity metrics: voiced fraction, per-frame energy envelope
    correlation with the requested mel (Pearson r), peak/RMS."""
    frame = VOC_HOP
    n = len(audio) // frame
    energy = np.array([
        np.sqrt(np.mean(audio[i * frame:(i + 1) * frame] ** 2) + 1e-12)
        for i in range(n)
    ])
    mel_energy = np.sqrt(np.mean(np.power(10, requested_mel[:n] / 10), axis=1))
    r = float(np.corrcoef(energy, mel_energy)[0, 1])
    return {
        "seconds": round(len(audio) / SR, 2),
        "peak": round(float(np.max(np.abs(audio))), 3),
        "rms": round(float(np.sqrt(np.mean(audio ** 2))), 4),
        "voiced_fraction": round(float(np.mean(energy > 0.01)), 2),
        "envelope_r": round(r, 3),
    }


def main() -> int:
    SAMPLES_OUT.mkdir(exist_ok=True)
    sys.path.insert(0, str(HERE / "_rtvc-src"))
    sys.path.insert(0, str(HERE))
    global mel_ref
    import mel_ref  # noqa: E402  (path set above)
    from clean_text import clean_and_sequence  # noqa: E402

    providers = ["CPUExecutionProvider"]
    encoder = ort.InferenceSession(str(HERE / "export/voice-encoder.onnx"), providers=providers)
    encode = ort.InferenceSession(str(HERE / "export/voice-synth-encode.onnx"), providers=providers)
    step = ort.InferenceSession(str(HERE / "export/voice-synth-step.onnx"), providers=providers)
    upsample = ort.InferenceSession(str(HERE / "export/voice-voc-upsample.onnx"), providers=providers)
    chunk = ort.InferenceSession(str(HERE / "export/voice-voc-chunk.onnx"), providers=providers)

    ids = clean_and_sequence(TEXT)
    text = np.asarray([ids], dtype=np.int64)
    print(f"text: {TEXT!r} -> {len(ids)} symbols")

    for name in ["p240_00000.mp3", "1320_00000.mp3"]:
        src = HERE / "_rtvc-src/samples" / name
        wav, _ = librosa.load(str(src), sr=SR, mono=True)
        wav = wav.astype(np.float32)
        speaker = name.split("_")[0]
        embed = embed_utterance(encoder, wav)
        print(f"{name}: {len(wav)/SR:.1f}s -> embedding {embed.shape}, "
              f"norm {np.linalg.norm(embed):.3f}")

        encode_out = encode.run(None, {"text": text, "spk_embed": embed[None]})
        mel = decode_mel(step, encode_out, text)  # (T, 80) normalised
        print(f"  decoded {mel.shape[0]} mel frames ({mel.shape[0]*12.5/1000:.1f}s of audio)")

        variants = {
            "wavernn": vocode(upsample, chunk, mel, "random"),
            "wavernn-argmax": vocode(upsample, chunk, mel, "argmax"),
        }
        if speaker == "p240":  # Griffin-Lim floor once — it is slow.
            gl = mel_ref.synth_griffin_lim(mel.T)  # (80, T) normalised mel in
            gl = gl[: (mel.shape[0] - 1) * VOC_HOP]
            gl = gl / max(1e-6, np.max(np.abs(gl))) * 0.9
            variants["griffin-lim"] = gl.astype(np.float32)

        for variant, audio in variants.items():
            out = SAMPLES_OUT / f"clone-{speaker}-{variant}.wav"
            _write_wav(out, audio)
            print(f"  {variant}: {out.name} {diagnostics(audio, mel)}")
    print(f"\nsamples in {SAMPLES_OUT} — A/B against each other; the real "
          "listening test (your own mic at /voice) is still the human step.")
    return 0


def _write_wav(path: Path, samples: np.ndarray) -> None:
    import struct

    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    data = pcm.tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)


if __name__ == "__main__":
    raise SystemExit(main())