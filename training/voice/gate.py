"""Stage gate: compare compressed voice-ONNX candidates against the fp32
exports (CPU ORT). For each graph the fixture-relevant metric:

  encoder          — L2-normalised embedding: cosine >= 0.9999, max|Δ| <= 0.01
  synth-encode     — enc_seq/enc_seq_proj: max|Δ| <= 0.05
  synth-step       — mel frame + stop token + carried state: max|Δ| <= 0.05
  voc-upsample     — mels_cond/aux: max|Δ| <= 0.02
  voc-step         — 512 logits: max|Δ| <= 0.05 (sampling happens in TS, so
                     logit errors of ~0.05 are below one class's margin)

Inputs are the same deterministic synthetic tensors `scripts/smoke-voice-ort.ts`
uses — enough to catch precision blow-ups and op-coverage differences; the
end-to-end numeric gate is `npm run verify:voice-model` (wasm, fixture-driven),
and the human-ear check is manual. The smallest passing candidate ships.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

TEXT_LEN = 50
MEL_FRAMES = 32


def feed_for(prefix: str, name: str, session: ort.InferenceSession) -> dict:
    if name == "voice-encoder":
        return {"mel_partial": np.zeros((1, 40, 160), np.float32)}
    if name == "voice-synth-encode":
        return {"text": np.zeros((1, TEXT_LEN), np.int64),
                "spk_embed": np.zeros((1, 256), np.float32)}
    if name == "voice-synth-step":
        return {
            "enc_seq": np.zeros((1, TEXT_LEN, 512), np.float32),
            "enc_seq_proj": np.zeros((1, TEXT_LEN, 128), np.float32),
            "chars": np.ones((1, TEXT_LEN), np.int64),
            "prenet_in": np.zeros((1, 80), np.float32),
            "attn_h": np.zeros((1, 128), np.float32),
            "rnn1_h": np.zeros((1, 1024), np.float32),
            "rnn2_h": np.zeros((1, 1024), np.float32),
            "rnn1_c": np.zeros((1, 1024), np.float32),
            "rnn2_c": np.zeros((1, 1024), np.float32),
            "context": np.zeros((1, 512), np.float32),
            "cumulative": np.zeros((1, TEXT_LEN), np.float32),
        }
    if name == "voice-voc-upsample":
        return {"mel": np.zeros((1, 80, MEL_FRAMES), np.float32)}
    if name == "voice-voc-step":
        return {
            "x_prev": np.zeros((1, 1), np.float32),
            "m_t": np.zeros((1, 80), np.float32),
            "a1": np.zeros((1, 32), np.float32),
            "a2": np.zeros((1, 32), np.float32),
            "a3": np.zeros((1, 32), np.float32),
            "a4": np.zeros((1, 32), np.float32),
            "h1": np.zeros((1, 512), np.float32),
            "h2": np.zeros((1, 512), np.float32),
        }
    raise SystemExit(f"unknown graph {name}")


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
    threshold = 0.02 if name == "voice-voc-upsample" else 0.05
    return worst <= threshold, worst


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument(
        "--graphs", nargs="+", default=None,
        help="graph names to gate (default: every fp32 export present)",
    )
    args = parser.parse_args()

    names = args.graphs or [
        p.stem
        for p in sorted(args.export_dir.glob("voice-*.onnx"))
        if p.stem.count("-") == 1
    ]
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
        feed = feed_for(name, ref_session)
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