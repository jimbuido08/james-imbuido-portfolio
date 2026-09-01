"""Strength-ordering harness: play exported ONNX models against each other
and against Python ports of the site's heuristic opponents.

The heuristics below are ports of lib/chess/opponents.ts (same formulas):
  easy   — uniform random legal move
  medium — captured*10 - piece*0.25 + check*1.5 (random tie-break)
  hard   — depth-2 negamax with alpha-beta over material+centrality
           (random tie-break)

20 games per pairing with colours swapped. Pass --model repeatedly to rank
several candidates in one run.
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

from bands import BAND_NAMES
from encode import encode_position, square_index

CENTRAL_SQUARES = {"d4", "e4", "d5", "e5"}
PIECE_VALUE = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0,
}
MATE_SCORE = 10000
MAX_PLIES = 300


def _centrality(piece_type: int, square: chess.Square) -> float:
    if piece_type not in (chess.PAWN, chess.KNIGHT):
        return 0.0
    return 0.05 if chess.square_name(square) in CENTRAL_SQUARES else 0.0


def evaluate_board(board: chess.Board) -> int:
    """Material + centrality, White-positive (port of evaluate())."""
    score = 0
    for square, piece in board.piece_map().items():
        value = PIECE_VALUE[piece.piece_type] + _centrality(piece.piece_type, square)
        score += value if piece.color == chess.WHITE else -value
    return score


def search(board: chess.Board, depth: int, alpha: float, beta: float) -> float:
    """Port of the TS negamax: score relative to the side to move."""
    if board.is_checkmate():
        return -MATE_SCORE - depth
    if board.is_game_over(claim_draw=False):
        return 0
    if depth == 0:
        return evaluate_board(board) * (1 if board.turn == chess.WHITE else -1)

    best = -float("inf")
    for move in board.legal_moves:
        board.push(move)
        score = -search(board, depth - 1, -beta, -alpha)
        board.pop()
        best = max(best, score)
        alpha = max(alpha, best)
        if alpha >= beta:
            break
    return best


def medium_score(board: chess.Board, move: chess.Move) -> float:
    """Port of the TS medium opponent's 1-ply score."""
    capture = board.piece_type_at(move.to_square)
    captured = PIECE_VALUE[capture] if capture else 0
    mover = board.piece_type_at(move.from_square)
    board.push(move)
    gives_check = board.is_check()
    board.pop()
    return (
        captured * 10
        - PIECE_VALUE[mover] * 0.25
        + (1.5 if gives_check else 0)
    )


def heuristic_move(
    level: str, board: chess.Board, rng: random.Random
) -> chess.Move:
    legal = list(board.legal_moves)
    if level == "easy":
        return rng.choice(legal)
    if level == "medium":
        best = -float("inf")
        best_moves = []
        for move in legal:
            s = medium_score(board, move)
            if s > best:
                best, best_moves = s, [move]
            elif s == best:
                best_moves.append(move)
        return rng.choice(best_moves)
    # hard: depth-2 negamax (root 1-ply + search depth 1 below)
    best = -float("inf")
    best_moves = []
    for move in legal:
        board.push(move)
        s = -search(board, 1, -float("inf"), float("inf"))
        board.pop()
        if s > best:
            best, best_moves = s, [move]
        elif s == best:
            best_moves.append(move)
    return rng.choice(best_moves)


@dataclass
class ModelPlayer:
    band: str
    session: ort.InferenceSession

    def select(self, board: chess.Board) -> chess.Move:
        fen = board.fen()
        mirror = board.turn == chess.BLACK
        logits = self.session.run(
            None, {"board": encode_position(fen)[None].astype(np.float32)}
        )[0][0]
        best_idx = -1
        best_move: chess.Move | None = None
        seen: set[int] = set()
        for move in board.legal_moves:
            idx = (
                square_index(chess.square_name(move.from_square), mirror) * 64
                + square_index(chess.square_name(move.to_square), mirror)
            )
            if idx in seen:
                continue
            seen.add(idx)
            if best_move is None or logits[idx] > logits[best_idx]:
                best_move, best_idx = move, idx
        assert best_move is not None
        return best_move


def heuristic_player(level: str, rng: random.Random):
    def select(board: chess.Board) -> chess.Move:
        return heuristic_move(level, board, rng)

    return select


def play_game(
    white, black, rng: random.Random
) -> str:
    """Returns 'white' | 'black' | 'draw'."""
    board = chess.Board()
    for _ply in range(MAX_PLIES):
        if board.is_game_over(claim_draw=False):
            break
        mover = white if board.turn == chess.WHITE else black
        board.push(mover(board))
    outcome = board.outcome(claim_draw=False)
    if outcome is None or outcome.winner is None:
        return "draw"
    return "white" if outcome.winner == chess.WHITE else "black"


def run_pairing(
    white_name, white_select, black_name, black_select, games: int, rng: random.Random
) -> dict[str, float]:
    wins = {white_name: 0, black_name: 0, "draw": 0}
    for game_index in range(games):
        # colours swap every game
        if game_index % 2 == 0:
            result = play_game(white_select, black_select, rng)
            winner = {"white": white_name, "black": black_name, "draw": "draw"}[result]
        else:
            result = play_game(black_select, white_select, rng)
            winner = {"white": black_name, "black": white_name, "draw": "draw"}[result]
        wins[winner] += 1
    total = games
    return {
        f"{white_name}_wins": wins[white_name] / total,
        f"{black_name}_wins": wins[black_name] / total,
        "draws": wins["draw"] / total,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        action="append",
        required=True,
        metavar="BAND:PATH",
        help="exported ONNX candidate, e.g. hard:export/hard/int8.onnx (repeatable)",
    )
    parser.add_argument("--opponents", nargs="+",
                        default=["easy", "medium", "hard"],
                        choices=["easy", "medium", "hard"])
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    models: dict[str, ort.InferenceSession] = {}
    for spec in args.model:
        band, _, path = spec.partition(":")
        if band not in BAND_NAMES or not path:
            parser.error(
                f"--model must be BAND:PATH with BAND in {BAND_NAMES}"
            )
        models[band] = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])

    print(f"[play_eval] {args.games} games per pairing (colours swapped), seed={args.seed}")
    rows = []
    for band, session in models.items():
        model_select = ModelPlayer(band, session).select
        for opponent in args.opponents:
            stats = run_pairing(
                f"{band}",
                model_select,
                f"heuristic-{opponent}",
                heuristic_player(opponent, rng),
                args.games,
                rng,
            )
            model_score = stats[f"{band}_wins"]
            opp_score = stats[f"heuristic-{opponent}_wins"]
            rows.append((band, opponent, model_score, opp_score, stats["draws"]))
            print(
                f"  {band} vs heuristic-{opponent}: "
                f"{model_score:.0%} / {opp_score:.0%} / draw {stats['draws']:.0%}"
            )

    # Also model-vs-model across bands when more than one was given.
    bands = list(models)
    if len(bands) > 1:
        for i, band in enumerate(bands):
            for other in bands[i + 1 :]:
                stats = run_pairing(
                    band,
                    ModelPlayer(band, models[band]).select,
                    other,
                    ModelPlayer(other, models[other]).select,
                    args.games,
                    rng,
                )
                print(
                    f"  {band} vs {other}: {stats[f'{band}_wins']:.0%} / "
                    f"{stats[f'{other}_wins']:.0%} / draw {stats['draws']:.0%}"
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())