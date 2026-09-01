"""Train one band's policy net. fp32 (MPS bf16 autocast is flaky), AdamW +
warmup→cosine, best-on-validation checkpointing, masked and unmasked val
metrics each epoch (see evaluate.py for the metric definitions)."""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from bands import BANDS
from dataset import BandDataset, collate
from model import (
    PolicyNet,
    count_parameters,
    flip_labels_lr,
    flip_planes_lr,
)


def build_legal_mask(
    legal: list[list[int]], n_logits: int, device: torch.device
) -> torch.Tensor:
    """(B, n_logits) bool mask of legal policy indices for each row."""
    mask = torch.zeros(len(legal), n_logits, dtype=torch.bool, device=device)
    for i, moves in enumerate(legal):
        mask[i, moves] = True
    return mask


def masked_metrics(
    logits: torch.Tensor,
    targets: torch.Tensor,
    legal_mask: torch.Tensor,
) -> tuple[float, float, float, float]:
    """(top1_unmasked, top1_masked, top3_masked, argmax_legal_frac) for a batch.

    Masked metrics restrict the argmax to each row's legal-move policy indices
    (deployment-honest). Runs on CPU tensors — vectorized, no per-row sync.
    """
    with torch.no_grad():
        pred = logits.argmax(dim=1)
        top1_unmasked = (pred == targets).float().mean().item()

        neg_inf = torch.finfo(logits.dtype).min
        masked = logits.masked_fill(~legal_mask, neg_inf)
        masked_pred = masked.argmax(dim=1)
        top1_masked = (masked_pred == targets).float().mean().item()

        k = min(3, logits.shape[1])
        topk_idx = masked.topk(k, dim=1).indices
        top3_masked = (
            (topk_idx == targets.unsqueeze(1)).any(dim=1).float().mean().item()
        )

        argmax_legal = (
            legal_mask[torch.arange(len(pred)), pred].float().mean().item()
        )
        return top1_unmasked, top1_masked, top3_masked, argmax_legal


@torch.no_grad()
def validate(
    model: PolicyNet,
    loader: DataLoader,
    legal_sets: list[list[int]],
    device: torch.device,
) -> dict[str, float]:
    model.eval()
    total_loss = 0.0
    m = [0.0, 0.0, 0.0, 0.0]
    n = 0
    criterion = torch.nn.CrossEntropyLoss(reduction="sum")
    for xs, ys in loader:
        xs, ys = xs.to(device), ys.to(device)
        logits = model(xs).cpu()
        ys = ys.cpu()
        legal_mask = build_legal_mask(
            legal_sets[n : n + xs.shape[0]], logits.shape[1], torch.device("cpu")
        )
        total_loss += criterion(logits.to(device), ys.to(device)).item()
        vals = masked_metrics(logits, ys, legal_mask)
        m = [a + b * xs.shape[0] for a, b in zip(m, vals)]
        n += xs.shape[0]
    return {
        "val_loss": total_loss / n,
        "val_top1": m[0] / n,
        "val_top1_masked": m[1] / n,
        "val_top3_masked": m[2] / n,
        "val_argmax_legal": m[3] / n,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--band", required=True, choices=list(BANDS))
    parser.add_argument("--data", type=Path, required=True, help="band data dir")
    parser.add_argument("--out", type=Path, required=True, help="checkpoint dir")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--warmup", type=int, default=200)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--flip-augment",
        action="store_true",
        help="horizontal-flip augmentation (default OFF — label/castling "
        "mirroring is bug-prone; see model.py)",
    )
    parser.add_argument(
        "--val-limit",
        type=int,
        default=20000,
        help="cap val samples per epoch for speed",
    )
    args = parser.parse_args()

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    torch.manual_seed(0)

    train_ds = BandDataset(str(args.data / "train.tsv"))
    val_ds = BandDataset(str(args.data / "val.tsv"))
    legal = val_ds.legal_sets()
    if args.val_limit < len(val_ds):
        # Deterministic subset keeps epoch wall-clock bounded; legal sets align
        # because the val loader never shuffles.
        idx = list(range(args.val_limit))
        val_ds = torch.utils.data.Subset(val_ds, idx)  # type: ignore[assignment]
        legal = [legal[i] for i in idx]

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        collate_fn=collate,
        persistent_workers=args.workers > 0,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        collate_fn=collate,
    )

    model = PolicyNet().to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.lr, weight_decay=args.weight_decay
    )
    steps_per_epoch = len(train_loader)
    total_steps = steps_per_epoch * args.epochs

    def lr_lambda(step: int) -> float:
        if step < args.warmup:
            return (step + 1) / args.warmup
        progress = (step - args.warmup) / max(1, total_steps - args.warmup)
        return 0.5 * (1 + math.cos(math.pi * min(1.0, progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    args.out.mkdir(parents=True, exist_ok=True)
    history: list[dict[str, float | int]] = []
    best_val = math.inf
    criterion = torch.nn.CrossEntropyLoss()

    print(
        f"[train] band={args.band} device={device.type} "
        f"params={count_parameters(model):,} steps/epoch={steps_per_epoch} "
        f"total={total_steps}",
        flush=True,
    )

    global_step = 0
    for epoch in range(args.epochs):
        model.train()
        t0 = time.time()
        running = 0.0
        seen = 0
        for xs, ys in train_loader:
            xs, ys = xs.to(device), ys.to(device)
            if args.flip_augment:
                flip = torch.rand(xs.shape[0]) < 0.5
                if flip.any():
                    xs[flip] = torch.stack(
                        [flip_planes_lr(x) for x in xs[flip]]
                    )
                    ys[flip] = flip_labels_lr(ys[flip])
            optimizer.zero_grad(set_to_none=True)
            logits = model(xs)
            loss = criterion(logits, ys)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            running += loss.item() * xs.shape[0]
            seen += xs.shape[0]
            global_step += 1
        train_loss = running / seen

        metrics = validate(model, val_loader, legal, device)
        metrics.update({"epoch": epoch + 1, "train_loss": train_loss})
        history.append(metrics)
        print(
            f"[train] epoch {epoch + 1}/{args.epochs} "
            f"train_loss={train_loss:.4f} val_loss={metrics['val_loss']:.4f} "
            f"top1={metrics['val_top1']:.3f} top1m={metrics['val_top1_masked']:.3f} "
            f"top3m={metrics['val_top3_masked']:.3f} "
            f"legal={metrics['val_argmax_legal']:.3f} "
            f"({time.time() - t0:.0f}s)",
            flush=True,
        )

        torch.save(model.state_dict(), args.out / "last.pt")
        if metrics["val_loss"] < best_val:
            best_val = metrics["val_loss"]
            torch.save(model.state_dict(), args.out / "best.pt")

    (args.out / "history.json").write_text(json.dumps(history, indent=2))
    print(f"[train] wrote {args.out}/history.json; best val_loss={best_val:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())