"""Stage gate: compare compressed voice-ONNX candidates against the fp32
exports (CPU ORT). For each graph the fixture-relevant metric:

  voice-encoder      — L2-normalised embedding: cosine >= 0.9999, max|Δ| <= 0.01
  voice-synth-encode — enc_seq/enc_seq_proj: max|Δ| <= 0.05
  voice-synth-step   — mel frame + stop token + carried state: max|Δ| <= 0.05
  voice-voc-upsample — mels_cond/aux: max|Δ| <= 0.02
  voice-voc-step     — 512 logits: max|Δ| <= 0.05 (sampling happens in TS, so
                       logit errors of ~0.05 are below one class's margin)
  voice-voc-chunk    — per-frame samples + carried state: max|Δ| <= 0.05 on the
                       fp32 path (chunk ships fp32 — see quantize.py)

Inputs are seeded random tensors in realistic ranges (zeros would be
degenerate: every LSTM frame identical, amplifying relative weight error) —
enough to catch precision blow-ups and op-coverage differences; the end-to-end
numeric gate is `npm run verify:voice-model` (wasm, fixture-driven), and the
human-ear check is manual. The smallest passing candidate ships.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

TEXT_LEN = 50
MEL_FRAMES = 32
SAMPLES_PER_FRAME = 200

# Seeded generator — deterministic across runs and machines.
_rng = np.random.RandomState(20260907)


def _r(*shape: int) -> np.ndarray:
    return _rng.randn(*shape).astype(np.float32)

# fp32 graph name -> (candidate formats glob suffix, feed builder)
def _feed_encoder() -> dict:
    return {"mel_partial": np.abs(_r(1, 40, 160)) * 10}

def _feed_synth_encode() -> dict:
    spk = _r(1, 256)
    return {"text": _rng.randint(2, 66, (1, TEXT_LEN)).astype(np.int64),
            "spk_embed": (spk / np.linalg.norm(spk)).astype(np.float32)}

def _feed_synth_step() -> dict:
    return {
        "enc_seq": _r(1, TEXT_LEN, 512) * 0.1,
        "enc_seq_proj": _r(1, TEXT_LEN, 128),
        "chars": _rng.randint(2, 66, (1, TEXT_LEN)).astype(np.int64),
        "prenet_in": _r(1, 80),
        "attn_h": _r(1, 128) * 0.1,
        "rnn1_h": _r(1, 1024) * 0.1,
        "rnn2_h": _r(1, 1024) * 0.1,
        "rnn1_c": _r(1, 1024) * 0.1,
        "rnn2_c": _r(1, 1024) * 0.1,
        "context": _r(1, 512) * 0.1,
        "cumulative": _rng.rand(1, TEXT_LEN).astype(np.float32),
    }

def _feed_voc_upsample() -> dict:
    return {"mel": _r(1, 80, MEL_FRAMES) * 0.5}

def _feed_voc_step() -> dict:
    return {
        "x_prev": _rng.rand(1, 1).astype(np.float32) * 2 - 1,
        "m_t": _r(1, 80),
        "a1": _r(1, 32),
        "a2": _r(1, 32),
        "a3": _r(1, 32),
        "a4": _r(1, 32),
        "h1": _r(1, 512) * 0.1,
        "h2": _r(1, 512) * 0.1,
    }

def _feed_voc_chunk() -> dict:
    return {
        "x_prev": _rng.rand(1, 1).astype(np.float32) * 2 - 1,
        "mels": _r(SAMPLES_PER_FRAME, 80) * 0.5,
        "aux": _r(SAMPLES_PER_FRAME, 128) * 0.5,
        "h1": _r(1, 512) * 0.1,
        "h2": _r(1, 512) * 0.1,
        "u": _rng.rand(SAMPLES_PER_FRAME).astype(np.float32).clip(1e-3, 1 - 1e-3),
    }

GRAPHS = {
    "voice-encoder": _feed_encoder,
    "voice-synth-encode": _feed_synth_encode,
    "voice-synth-step": _feed_synth_step,
    "voice-voc-upsample": _feed_voc_upsample,
    "voice-voc-step": _feed_voc_step,
    "voice-voc-chunk": _feed_voc_chunk,
}

# Thresholds per graph (max|Δ| unless noted).
THRESHOLDS = {
    "voice-encoder": 0.01,
    "voice-synth-encode": 0.05,
    "voice-synth-step": 0.05,
    "voice-voc-upsample": 0.02,
    "voice-voc-step": 0.05,
    "voice-voc-chunk": 0.05,
}


def compare(name: str, ref: list[np.ndarray], cand: list[np.ndarray]) -> tuple[bool, float]:
    if name == "voice-encoder":
        ref_v, cand_v = ref[0][0], cand[0][0]
        cosine = float(
            np.dot(ref_v, cand_v) / (np.linalg.norm(ref_v) * np.linalg.norm(cand_v))
        )
        max_diff = float(np.max(np.abs(ref_v - cand_v)))
        return cosine >= 0.9999 and max_diff <= 0.01, max_diff
    worst = 0.0
    for ref_out, cand_out in zip(ref, cand):
        worst = max(worst, float(np.max(np.abs(ref_out - cand_out))))
    return worst <= THRESHOLDS[name], worst


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument(
        "--graphs", nargs="+", choices=sorted(GRAPHS), default=None,
        help="graph names to gate (default: every fp32 export present)",
    )
    args = parser.parse_args()

    names = args.graphs or [n for n in GRAPHS if (args.export_dir / f"{n}.onnx").exists()]
    if not names:
        raise SystemExit("no fp32 exports found")

    any_failure = False
    for name in names:
        ref_path = args.export_dir / f"{name}.onnx"
        if not ref_path.exists():
            print(f"[gate] {name}: fp32 export absent, skipped")
            continue
        ref_session = ort.InferenceSession(
            str(ref_path), providers=["CPUExecutionProvider"]
        )
        feed = GRAPHS[name]()
        ref_out = ref_session.run(None, feed)

        candidates = sorted(args.export_dir.glob(f"{name}-*.onnx"))
        if not candidates:
            print(f"[gate] {name}: no candidates")
            continue
        for cand_path in candidates:
            try:
                session = ort.InferenceSession(
                    str(cand_path), providers=["CPUExecutionProvider"]
                )
                cand_out = session.run(None, feed)
            except Exception as err:  # noqa: BLE001
                print(f"[gate] {cand_path.name}: FAILED TO RUN ({err})")
                any_failure = True
                continue
            ok, metric = compare(name, ref_out, cand_out)
            size_mb = cand_path.stat().st_size / 1024 / 1024
            print(
                f"[gate] {cand_path.name} ({size_mb:.2f} MB): "
                f"{'SHIP' if ok else 'REJECT'} (max|Δ|={metric:.4f})"
            )
            if not ok:
                any_failure = True
    return 1 if any_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())