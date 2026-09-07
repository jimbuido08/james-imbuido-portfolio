"""Produce compressed ONNX candidates from the fp32 voice exports.

fp16 — half-precision conversion (keep_io_types: graphs keep fp32 inputs/outputs
so the TS contract never changes)
int8  — dynamic quantization (QInt8 weights; may fail on LSTM-heavy graphs —
        failures are reported, never fatal)

Candidates land next to the fp32 export; `gate.py` compares them against fp32
and `npm run verify:voice-model` (wasm) decides what ships.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

GRAPH_NAMES = [
    "voice-encoder",
    "voice-synth-encode",
    "voice-synth-step",
    "voice-voc-upsample",
    "voice-voc-step",
    "voice-voc-chunk",
]


def convert_fp16(src: Path, dst: Path) -> None:
    from onnxconverter_common import float16

    import onnx

    model = onnx.load(str(src))
    fp16_model = float16.convert_float_to_float16(model, keep_io_types=True)
    onnx.save(fp16_model, str(dst))


def quantize_int8(src: Path, dst: Path) -> None:
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    try:
        quantize_dynamic(
            model_input=str(src),
            model_output=str(dst),
            weight_type=QuantType.QInt8,
        )
    except Exception:
        # The chunk graph's in-graph gumbel ops (Log/Sqrt chain feeding argmax)
        # defeat shape inference for some MatMul inputs — give the quantizer a
        # default tensor type so those stay fp32 while weights still quantise.
        quantize_dynamic(
            model_input=str(src),
            model_output=str(dst),
            weight_type=QuantType.QInt8,
            extra_options={"DefaultTensorType": onnx.TensorProto.FLOAT},
        )


def smoke(path: Path) -> None:
    """Load + run with zeros so every candidate is exercised before the gate."""
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    feed = {}
    for meta in session.get_inputs():
        shape = [d if isinstance(d, int) else 32 for d in meta.shape]
        feed[meta.name] = np.zeros(
            shape, dtype=np.int64 if meta.type == "tensor(int64)" else np.float32
        )
    results = session.run(None, feed)
    for result in results:
        assert np.isfinite(result).all(), f"non-finite output from {path.name}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--formats", nargs="+", default=["fp16"],
                        choices=["fp16", "int8"])
    args = parser.parse_args()

    made: list[Path] = []
    for name in GRAPH_NAMES:
        src = args.export_dir / f"{name}.onnx"
        if not src.exists():
            print(f"[quantize] {src.name}: absent, skipped")
            continue
        for fmt in args.formats:
            dst = src.with_name(f"{name}-{fmt}.onnx")
            try:
                if fmt == "fp16":
                    convert_fp16(src, dst)
                else:
                    quantize_int8(src, dst)
                smoke(dst)
                size_mb = dst.stat().st_size / 1024 / 1024
                print(f"[quantize] {fmt} -> {dst.name} ({size_mb:.2f} MB)")
                made.append(dst)
            except Exception as err:  # noqa: BLE001 — a candidate failing to build is a gate finding
                print(f"[quantize] {fmt} FAILED for {name}: {err}")
                if dst.exists():
                    dst.unlink()

    print(f"[quantize] {len(made)} candidates built and CPU-ORT smoke-tested")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())