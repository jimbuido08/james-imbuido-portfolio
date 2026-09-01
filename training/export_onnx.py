"""Export a trained checkpoint to ONNX (opset 17, fixed shape, names
`board`/`policy`) into export/<band>/fp32.onnx."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch

from bands import BANDS, model_filename
from encode import PLANES, POLICY_LOGITS
from model import PolicyNet


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--band", required=True, choices=list(BANDS))
    parser.add_argument("--checkpoint", type=Path, required=True, help="best.pt")
    parser.add_argument("--out", type=Path, required=True, help="output .onnx")
    args = parser.parse_args()

    device = torch.device("cpu")  # export on CPU — deterministic weights
    model = PolicyNet().to(device)
    model.load_state_dict(torch.load(args.checkpoint, map_location=device))
    model.eval()

    dummy = torch.zeros(1, PLANES, 8, 8, device=device)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (dummy,),
        str(args.out),
        input_names=["board"],
        output_names=["policy"],
        opset_version=17,
        dynamo=False,  # the classic exporter keeps the graph shape-annotated
    )
    size_mb = args.out.stat().st_size / 1024 / 1024
    print(f"[export] {model_filename(args.band)} -> {args.out} ({size_mb:.2f} MB)")

    # Smoke-test the export round-trips through onnxruntime.
    import numpy as np
    import onnxruntime as ort

    session = ort.InferenceSession(str(args.out), providers=["CPUExecutionProvider"])
    out = session.run(None, {"board": np.zeros((1, PLANES, 8, 8), np.float32)})[0]
    assert out.shape == (1, POLICY_LOGITS), out.shape
    assert np.isfinite(out).all()
    print(f"[export] verified: policy shape {out.shape}, all finite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())