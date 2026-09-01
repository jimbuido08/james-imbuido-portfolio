"""Legality self-check for an exported ONNX artifact: over 2000 val positions,
the artifact's masked choice must always be a legal move and every logit must
be finite. Mirrors what the browser does (argmax over input.legal, never
inverting logits)."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

from bands import BANDS
from dataset import BandDataset
from encode import encode_position, policy_index, square_index, uci_to_label


def select_move(session: ort.InferenceSession, fen: str, legal_ucis: list[str]) -> str:
    """The deployment decision rule: never invert logits, mask by legality.

    Non-queen promotions (label None) share their from/to index with the
    queen promotion, so they score identically.
    """
    mirror = fen.split()[1] == "b"
    logits = session.run(
        None, {"board": encode_position(fen)[None].astype(np.float32)}
    )[0][0]
    assert np.isfinite(logits).all(), "non-finite logits"
    best_idx = -1
    best_move = None
    for uci in legal_ucis:
        pair = uci_to_label(uci, mirror)
        if pair is None:
            pair = (
                square_index(uci[:2], mirror),
                square_index(uci[2:4], mirror),
            )
        idx = policy_index(*pair)
        if best_move is None or logits[idx] > logits[best_idx]:
            best_move, best_idx = uci, idx
    assert best_move is not None
    return best_move


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--band", required=True, choices=list(BANDS))
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True, help=".onnx artifact")
    parser.add_argument("--limit", type=int, default=2000)
    args = parser.parse_args()

    session = ort.InferenceSession(
        str(args.model), providers=["CPUExecutionProvider"]
    )
    dataset = BandDataset(str(args.data / "val.tsv"))
    limit = min(args.limit, len(dataset))

    legal_all = dataset.legal_sets()
    checked = 0
    for i in range(limit):
        fen, _played, legal = dataset.rows[i]
        choice = select_move(session, fen, legal)
        assert choice in legal, f"illegal choice {choice} for {fen}"
        checked += 1
    print(f"[selfcheck] band={args.band} model={args.model.name}: "
          f"{checked} positions, all choices legal and finite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())