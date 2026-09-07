"""Milestone A throwaway: export the SV2TTS speaker encoder's partial-embedding
graph to ONNX (opset 17, fixed shape [1, 40, 160] -> [1, 256]).

The reference repo is CorentinJ/Real-Time-Voice-Cloning (PyTorch). Its
embed_utterance() splits a mel into 160-frame partials, embeds each with this
graph, then averages + L2-normalises in numpy — the split/mean/norm lives in TS
(lib/voice), never in the graph. See docs/notes/voice-cloning-architecture.md.

Run on the Mac (see training/voice/README.md):
    python export_encoder.py --checkpoint pretrained/encoder.pt \
        --out export/voice-encoder.onnx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn

RTVC = Path(__file__).resolve().parent / "_rtvc-src"
if not RTVC.is_dir():
    raise SystemExit(
        "reference repo missing — clone CorentinJ/Real-Time-Voice-Cloning to "
        f"{RTVC} (see README.md)"
    )
sys.path.insert(0, str(RTVC))

MEL_BINS = 40  # encoder.params_data.mel_n_channels
PARTIAL_FRAMES = 160  # encoder.params_data.partials_n_frames
EMBEDDING_SIZE = 256  # encoder.params_model.model_embedding_size


class PartialEncoder(nn.Module):
    """[1, 40, 160] channel-major mel partial -> [1, 256] L2-normalised embed."""

    def __init__(self, encoder: nn.Module) -> None:
        super().__init__()
        self.encoder = encoder

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # SpeakerEncoder.forward is batch-first over time: (batch, n_frames, 40)
        return self.encoder(mel.permute(0, 2, 1).contiguous())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoint", type=Path, required=True, help="pretrained/encoder.pt"
    )
    parser.add_argument("--out", type=Path, required=True, help="output .onnx")
    args = parser.parse_args()

    from encoder.model import SpeakerEncoder

    device = torch.device("cpu")
    model = SpeakerEncoder(device, torch.device("cpu"))
    # weights_only=False: the checkpoint is a plain dict of tensors + ints.
    checkpoint = torch.load(args.checkpoint, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    wrapper = PartialEncoder(model).eval()
    dummy = torch.zeros(1, MEL_BINS, PARTIAL_FRAMES)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapper,
        (dummy,),
        str(args.out),
        input_names=["mel_partial"],
        output_names=["embed"],
        opset_version=17,
        dynamo=False,  # the classic exporter keeps the graph shape-annotated
    )
    size_mb = args.out.stat().st_size / 1024 / 1024
    print(f"[export] encoder -> {args.out} ({size_mb:.2f} MB)")

    # Verify the export: ORT must agree with PyTorch on a seeded random input.
    import numpy as np
    import onnxruntime as ort

    session = ort.InferenceSession(
        str(args.out), providers=["CPUExecutionProvider"]
    )
    torch.manual_seed(20260906)
    random_mel = torch.randn(1, MEL_BINS, PARTIAL_FRAMES).abs()
    with torch.no_grad():
        reference = wrapper(random_mel).numpy()
    out = session.run(
        None, {"mel_partial": random_mel.numpy()}
    )[0]
    assert out.shape == (1, EMBEDDING_SIZE), out.shape
    norm = np.linalg.norm(out[0])
    max_delta = float(np.abs(out - reference).max())
    assert np.isfinite(out).all() and abs(norm - 1.0) < 0.05, f"norm {norm}"
    assert max_delta < 1e-4, f"PyTorch vs ONNX max |delta| {max_delta}"
    print(f"[export] verified: embed shape {out.shape}, L2 norm ~ {norm:.3f}, "
          f"PyTorch parity max |delta| = {max_delta:.2e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())