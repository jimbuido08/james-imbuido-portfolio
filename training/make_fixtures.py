"""Generate the cross-language parity fixtures.

golden_positions.json — deterministic board-encoding cases with the Python
    encoder's `planes_sha256` (the TypeScript encoder must reproduce them;
    `npm run verify:chess-model` checks this).
model_expectations.json — per difficulty x golden FEN, the SHIPPED artifact's
    top-1 legal move (from+to, promotion-blind), so the site's decision rule
    is regression-tested whenever artifacts change.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess

from bands import BAND_NAMES, model_filename
from encode import digest_planes, encode_position, square_index

# ~12 cases covering: start; all castling combos; Black-to-move middlegame;
# en-passant for both sides; check; pawn-on-7th; sparse endgame.
GOLDEN_FENS: dict[str, str] = {
    "start": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "castling_all_w": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    "castling_all_b": "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1",
    "castling_partial_w": "r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1",
    "castling_partial_b": "r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1",
    "middlegame_btm": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4",
    "ep_white": "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
    "ep_black": "rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3",
    "check_w": "k3r3/8/8/8/8/8/8/4K3 w - - 0 1",
    "pawn_7th": "rnbqkbnr/ppppPppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
    "sparse_endgame_w": "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
    "sparse_endgame_b": "4k3/8/8/8/8/8/8/4K2R b - - 0 1",
}

MAX_MOVES_PER_FIXTURE = 6


def build_golden() -> list[dict]:
    fixtures = []
    for name, fen in GOLDEN_FENS.items():
        board = chess.Board(fen)  # raises on an illegal FEN — generation gate
        assert board.is_valid(), f"{name} is not a legal position: {fen}"
        assert not board.is_checkmate() and not board.is_stalemate(), name

        mirror = fen.split()[1] == "b"
        moves = []
        for move in sorted(board.legal_moves, key=lambda m: m.uci()):
            pair_from = square_index(chess.square_name(move.from_square), mirror)
            pair_to = square_index(chess.square_name(move.to_square), mirror)
            moves.append(
                {
                    "uci": move.uci(),
                    "from_idx": pair_from,
                    "to_idx": pair_to,
                }
            )
            if len(moves) >= MAX_MOVES_PER_FIXTURE:
                break

        planes = encode_position(fen)
        fixtures.append(
            {
                "name": name,
                "fen": fen,
                "planes_sha256": digest_planes(planes),
                "moves": moves,
            }
        )
    return fixtures


def masked_top1(fen: str, logits, board: chess.Board) -> str:
    """The deployment decision rule in Python (mirrors lib/chess/opponents.ts
    pickBest): score one index per (from, to) pair, queen variant kept,
    argmax, ties keep the first."""
    mirror = fen.split()[1] == "b"
    best_key = None
    best_idx = -1
    seen: set[int] = set()
    for move in board.legal_moves:
        from_idx = square_index(chess.square_name(move.from_square), mirror)
        to_idx = square_index(chess.square_name(move.to_square), mirror)
        idx = from_idx * 64 + to_idx
        if idx in seen:
            continue
        seen.add(idx)
        key = chess.square_name(move.from_square) + chess.square_name(
            move.to_square
        )
        if best_key is None or logits[idx] > logits[best_idx]:
            best_key, best_idx = key, idx
    assert best_key is not None
    return best_key


def build_expectations(models_dir: Path) -> dict[str, dict[str, str]]:
    import numpy as np
    import onnxruntime as ort

    expectations: dict[str, dict[str, str]] = {}
    for band in BAND_NAMES:
        path = models_dir / model_filename(band)
        if not path.exists():
            continue
        session = ort.InferenceSession(
            str(path), providers=["CPUExecutionProvider"]
        )
        band_expectations: dict[str, str] = {}
        for name, fen in GOLDEN_FENS.items():
            logits = session.run(
                None, {"board": encode_position(fen)[None].astype(np.float32)}
            )[0][0]
            band_expectations[GOLDEN_FENS[name]] = masked_top1(
                fen, logits, chess.Board(fen)
            )
        expectations[band] = band_expectations
    return expectations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures-dir", type=Path, default=Path(__file__).parent / "fixtures"
    )
    parser.add_argument(
        "--models-dir", type=Path, default=Path(__file__).parent.parent / "public" / "models"
    )
    args = parser.parse_args()

    args.fixtures_dir.mkdir(parents=True, exist_ok=True)
    golden = build_golden()
    (args.fixtures_dir / "golden_positions.json").write_text(
        json.dumps(golden, indent=2)
    )
    print(f"[fixtures] wrote golden_positions.json ({len(golden)} FENs)")

    expectations = build_expectations(args.models_dir)
    (args.fixtures_dir / "model_expectations.json").write_text(
        json.dumps(expectations, indent=2, sort_keys=True)
    )
    if expectations:
        bands = ", ".join(sorted(expectations))
        print(f"[fixtures] wrote model_expectations.json for: {bands}")
    else:
        print("[fixtures] no shipped artifacts found; expectations skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())