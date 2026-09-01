"""Produce compressed ONNX candidates from an fp32 export.

int8  — dynamic quantization (quantize_dynamic, QInt8 weights)
fp16  — half-precision conversion

Candidates land next to the fp32 export; the Stage 4 gate (evaluate-gate in
make_fixtures.py + verify:chess-model) decides which ships.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic


def quantize_int8(src: Path, dst: Path) -> None:
    quantize_dynamic(
        model_input=str(src),
        model_output=str(dst),
        weight_type=QuantType.QInt8,
    )


def convert_fp16(src: Path, dst: Path) -> None:
    # onnxconverter-common is optional (fp16 is only one of the candidates).
    from onnxconverter_common import float16

    model = onnx.load(str(src))
    # keep_io_types: the site feeds float32 `board` and expects float32
    # `policy` — only internal tensors may be float16.
    fp16_model = float16.convert_float_to_float16(model, keep_io_types=True)
    onnx.save(fp16_model, str(dst))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, required=True, help="fp32 export")
    parser.add_argument("--formats", nargs="+", default=["int8", "fp16"],
                        choices=["int8", "fp16"])
    args = parser.parse_args()

    made: list[Path] = []
    if "int8" in args.formats:
        dst = args.src.with_name(args.src.stem + "-int8.onnx")
        quantize_int8(args.src, dst)
        size_mb = dst.stat().st_size / 1024 / 1024
        print(f"[quantize] int8 -> {dst} ({size_mb:.2f} MB)")
        made.append(dst)
    if "fp16" in args.formats:
        try:
            dst = args.src.with_name(args.src.stem + "-fp16.onnx")
            convert_fp16(args.src, dst)
            size_mb = dst.stat().st_size / 1024 / 1024
            print(f"[quantize] fp16 -> {dst} ({size_mb:.2f} MB)")
            made.append(dst)
        except ImportError:
            print("[quantize] onnxconverter-common not installed; skipping fp16")

    for path in made:
        # Each candidate must load and run in CPU ORT before it can enter the gate.
        import numpy as np
        import onnxruntime as ort

        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        out = session.run(None, {"board": np.zeros((1, 17, 8, 8), np.float32)})[0]
        assert out.shape == (1, 4096), (path, out.shape)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())