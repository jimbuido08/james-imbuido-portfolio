"""Evaluate a trained checkpoint (or ONNX artifact) on a band's val TSV.

Metrics (mirrors train.py's validate()):
  top1        — unmasked argmax equals the played move
  top1_masked — deployment-honest: argmax over legal-move policy indices
  top3_masked — played move within the masked top-3
  argmax_legal— fraction of unmasked argmaxes that are legal at all
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch

from bands import BANDS
from dataset import BandDataset, collate
from model import PolicyNet
from train import build_legal_mask, masked_metrics


def evaluate_model(
    model: PolicyNet,
    dataset: BandDataset,
    device,
    batch_size: int = 512,
    workers: int = 4,
) -> dict[str, float]:
    from torch.utils.data import DataLoader

    legal = dataset.legal_sets()
    loader = DataLoader(
        dataset, batch_size=batch_size, shuffle=False,
        num_workers=workers, collate_fn=collate,
    )
    model.eval()
    m = [0.0, 0.0, 0.0, 0.0]
    n = 0
    with torch.no_grad():
        for xs, ys in loader:
            xs, ys = xs.to(device), ys.to(device)
            logits = model(xs).cpu()
            ys = ys.cpu()
            legal_mask = build_legal_mask(
                legal[n : n + xs.shape[0]], logits.shape[1], torch.device("cpu")
            )
            vals = masked_metrics(logits, ys, legal_mask)
            m = [a + b * xs.shape[0] for a, b in zip(m, vals)]
            n += xs.shape[0]
    return {
        "top1": m[0] / n,
        "top1_masked": m[1] / n,
        "top3_masked": m[2] / n,
        "argmax_legal": m[3] / n,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--band", required=True, choices=list(BANDS))
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True, help="best.pt")
    parser.add_argument("--batch-size", type=int, default=512)
    args = parser.parse_args()

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    dataset = BandDataset(str(args.data / "val.tsv"))
    model = PolicyNet().to(device)
    model.load_state_dict(torch.load(args.checkpoint, map_location=device))

    metrics = evaluate_model(model, dataset, device, args.batch_size)
    print(f"[evaluate] band={args.band} samples={len(dataset)}")
    for key, value in metrics.items():
        print(f"  {key}: {value:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())