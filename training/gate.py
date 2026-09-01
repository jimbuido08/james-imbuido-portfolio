"""Stage 4 gate: compare compressed ONNX candidates against the fp32 export.

For each candidate prints the gate inputs and a SHIP / REJECT verdict:
  (a) identical masked top-1 on every golden FEN
  (b) >= 98% argmax agreement with fp32 on 200 val positions
  (c) <= 1.0 point top1_masked drop vs fp32 on those val positions
  (d) loads + runs in onnxruntime (the ORT-web wasm round-trip is checked by
      `npm run verify:chess-model` after the winner is copied)

The smallest candidate passing all gates should be copied to
public/models/chess-<band>.onnx.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

from bands import BANDS
from dataset import BandDataset
from encode import encode_position
from make_fixtures import GOLDEN_FENS, masked_top1


def load_session(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def run_logits(session: ort.InferenceSession, fen: str) -> np.ndarray:
    return session.run(
        None, {"board": encode_position(fen)[None].astype(np.float32)}
    )[0][0]


def evaluate_candidate(
    session: ort.InferenceSession,
    dataset: BandDataset,
    limit: int,
) -> float:
    """Masked top-1 over `limit` val positions."""
    n = min(limit, len(dataset))
    hits = 0
    for i in range(n):
        fen, played, _legal = dataset.rows[i]
        logits = run_logits(session, fen)
        choice_key = masked_top1(fen, logits, chess.Board(fen))
        # played move as from+to (queen-promotion-blind)
        played_move = chess.Move.from_uci(played)
        played_key = chess.square_name(played_move.from_square) + chess.square_name(
            played_move.to_square
        )
        hits += int(choice_key == played_key)
    return hits / n


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--band", required=True, choices=list(BANDS))
    parser.add_argument("--data", type=Path, required=True, help="band data dir")
    parser.add_argument("--candidates", type=Path, nargs="+", required=True,
                        help="first candidate is the fp32 reference")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()

    reference_path = args.candidates[0]
    candidates = args.candidates[1:]
    if not candidates:
        parser.error("pass the fp32 export first, then the compressed candidates")

    dataset = BandDataset(str(args.data / "val.tsv"))
    reference = load_session(reference_path)

    # fp32 reference metrics + argmax vectors for agreement.
    ref_choices: list[str] = []
    ref_top1 = evaluate_candidate(reference, dataset, args.limit)
    for i in range(min(args.limit, len(dataset))):
        fen, _played, _legal = dataset.rows[i]
        ref_choices.append(masked_top1(fen, run_logits(reference, fen), chess.Board(fen)))

    # (a) golden-FEN masked top-1 must match the fp32 export exactly.
    ref_golden = {
        name: masked_top1(fen, run_logits(reference, fen), chess.Board(fen))
        for name, fen in GOLDEN_FENS.items()
    }

    print(f"[gate] band={args.band} reference={reference_path.name} "
          f"top1_masked={ref_top1:.4f} on {min(args.limit, len(dataset))} val positions")

    results = []
    for candidate_path in candidates:
        try:
            session = load_session(candidate_path)
        except Exception as err:  # noqa: BLE001 — a broken candidate just fails the gate
            print(f"[gate] {candidate_path.name}: FAILED TO LOAD ({err})")
            results.append((candidate_path, None))
            continue
        golden = {
            name: masked_top1(fen, run_logits(session, fen), chess.Board(fen))
            for name, fen in GOLDEN_FENS.items()
        }
        golden_identical = golden == ref_golden

        agree = 0
        for i, fen in enumerate(
            (dataset.rows[i][0] for i in range(min(args.limit, len(dataset))))
        ):
            agree += int(masked_top1(fen, run_logits(session, fen), chess.Board(fen)) == ref_choices[i])
        agreement = agree / len(ref_choices)

        top1 = evaluate_candidate(session, dataset, args.limit)
        drop = (ref_top1 - top1) * 100  # in points

        verdict = (
            "SHIP" if golden_identical and agreement >= 0.98 and drop <= 1.0
            else "REJECT"
        )
        size_mb = candidate_path.stat().st_size / 1024 / 1024
        print(
            f"[gate] {candidate_path.name}: {size_mb:.2f} MB | golden_identical={golden_identical} "
            f"agreement={agreement:.3f} top1={top1:.4f} drop={drop:+.2f}pts -> {verdict}"
        )
        results.append((candidate_path, verdict))

    passing = [
        (p, p.stat().st_size)
        for p, v in results
        if v == "SHIP"
    ]
    if passing:
        winner = min(passing, key=lambda t: t[1])[0]
        print(f"[gate] winner: {winner.name} (smallest passing candidate)")
        print(f"[gate] next: cp {winner} public/models/chess-{args.band}.onnx")
        return 0
    print("[gate] no candidate passed — fall back to the fp32 export")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())