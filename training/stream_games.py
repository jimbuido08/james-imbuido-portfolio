"""Stream Lichess rated games → per-band (fen, uci) TSVs.

Reads a .pgn.zst stream on stdin (pipe curl into this script), so no PGN is
ever stored — only extracted samples land in `data/<band>/{train,val}.tsv`.
Exits once every band's target is filled, which SIGPIPEs curl after a few GB.

Filters: Standard variant, both Elos numeric and in the SAME band, not
Abandoned/Unterminated, TimeControl base >= 60s, game >= --min-ply*2 plies.
Samples: plies >= --min-ply, at most --per-game per game, chosen by a
deterministic stride seeded from the game's header. Global FEN-hash dedup with
a bounded table; no cross-band dedup (band separation is the point).
Non-queen promotions are dropped (queen-only policy).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import sys
from pathlib import Path

import chess.pgn
import zstandard

from bands import BAND_NAMES, BANDS, band_for_elo

DEDUP_TABLE_CAP = 5_000_000


def header_hash(game: chess.pgn.Game) -> int:
    key = "|".join(
        str(game.headers.get(k, ""))
        for k in ("Site", "White", "Black", "UTCDate", "UTCTime")
    )
    return int.from_bytes(hashlib.md5(key.encode()).digest()[:8], "big")


def is_holdout(game_hash: int) -> bool:
    """Deterministic 3% of games held out for validation."""
    return game_hash % 100 < 3


def parse_time_control(tc: str) -> int | None:
    """Base time in seconds, or None for unlimited/invalid controls."""
    if not tc or tc == "-":
        return None
    base = tc.split("+")[0]
    return int(base) if base.isdigit() else None


def sample_positions(
    game: chess.pgn.Game,
    per_game: int,
    min_ply: int,
    rng: random.Random,
) -> tuple[list[tuple[str, str]], int]:
    """Deterministically pick <= per_game (fen, uci) samples with ply >= min_ply.

    The FEN is the position before the move (6 fields). python-chess's default
    en-passant FEN convention (only when a capture is legal) matches chess.js.
    Returns (samples, non_queen_promotions_dropped).
    """
    board = game.board()
    candidates: list[tuple[str, str, str]] = []
    promo_dropped = 0
    for ply, node in enumerate(game.mainline(), start=1):
        move = node.move
        if move is None:
            break
        if ply >= min_ply:
            if move.promotion is not None and move.promotion != chess.QUEEN:
                # Drop non-queen promotions (queen-only policy).
                promo_dropped += 1
            else:
                legal = " ".join(m.uci() for m in board.legal_moves)
                candidates.append((board.fen(), move.uci(), legal))
        board.push(move)
    if len(candidates) <= per_game:
        return candidates, promo_dropped
    idx = rng.sample(range(len(candidates)), per_game)
    return [candidates[i] for i in idx], promo_dropped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="data root")
    parser.add_argument(
        "--target",
        nargs="+",
        action="append",
        required=True,
        metavar="BAND:N",
        help="sample target per band, e.g. --target easy:700000 medium:700000",
    )
    parser.add_argument("--per-game", type=int, default=12)
    parser.add_argument("--min-ply", type=int, default=8)
    args = parser.parse_args()

    targets: dict[str, int] = {}
    for spec in [s for group in args.target for s in group]:
        name, _, n = spec.partition(":")
        if name not in BANDS or not n.isdigit():
            parser.error(f"--target must be BAND:N with BAND in {BAND_NAMES}")
        targets[name] = int(n)

    for band in BAND_NAMES:
        (args.out / band).mkdir(parents=True, exist_ok=True)

    files: dict[str, dict[str, io.TextIOWrapper]] = {}
    for band in targets:
        files[band] = {
            "train": (args.out / band / "train.tsv").open("w"),
            "val": (args.out / band / "val.tsv").open("w"),
        }

    stats: dict[str, dict[str, int]] = {
        band: {
            "games_seen": 0,
            "games_kept": 0,
            "games_val": 0,
            "samples_written": 0,
            "dedup_dropped": 0,
            "promo_dropped": 0,
        }
        for band in targets
    }
    # Per-band dedup tables (no cross-band dedup — band separation is the
    # point); the shared table budget is capped at 5M entries total.
    seen_fens: dict[str, set[bytes]] = {band: set() for band in targets}
    dedup_budget = DEDUP_TABLE_CAP

    stream = zstandard.ZstdDecompressor().stream_reader(sys.stdin.buffer)
    text = io.TextIOWrapper(stream, encoding="utf-8", errors="replace")

    games_parsed = 0
    while True:
        game = chess.pgn.read_game(text)
        if game is None:
            break
        games_parsed += 1
        if games_parsed % 20000 == 0:
            print(
                f"[stream_games] parsed={games_parsed} "
                + " ".join(
                    f"{b}={stats[b]['samples_written']}/{targets[b]}"
                    for b in BAND_NAMES
                    if b in targets
                ),
                flush=True,
            )
        if all(stats[b]["samples_written"] >= targets[b] for b in targets):
            break

        headers = game.headers
        variant = headers.get("Variant", "Standard")
        if variant != "Standard":
            continue
        termination = headers.get("Termination", "Normal")
        if termination in ("Abandoned", "Unterminated"):
            continue
        base_tc = parse_time_control(headers.get("TimeControl", ""))
        if base_tc is None or base_tc < 60:
            continue

        white_elo = headers.get("WhiteElo", "?")
        black_elo = headers.get("BlackElo", "?")
        if not white_elo.isdigit() or not black_elo.isdigit():
            continue
        white_band = band_for_elo(int(white_elo))
        black_band = band_for_elo(int(black_elo))
        if white_band is None or white_band != black_band:
            continue
        band = white_band
        if band not in targets:
            continue
        stats[band]["games_seen"] += 1

        ghash = header_hash(game)
        rng = random.Random(ghash)
        samples, promo_dropped = sample_positions(
            game, args.per_game, args.min_ply, rng
        )
        stats[band]["promo_dropped"] += promo_dropped
        if not samples:
            continue
        stats[band]["games_kept"] += 1
        split = "val" if is_holdout(ghash) else "train"
        if split == "val":
            stats[band]["games_val"] += 1

        out = files[band][split]
        for fen, uci, legal in samples:
            key = hashlib.blake2b(fen.encode(), digest_size=8).digest()
            band_fens = seen_fens[band]
            if key in band_fens:
                stats[band]["dedup_dropped"] += 1
                continue
            if dedup_budget > 0:
                band_fens.add(key)
                dedup_budget -= 1
            out.write(f"{fen}\t{uci}\t{legal}\n")
            stats[band]["samples_written"] += 1

    for band_files in files.values():
        for f in band_files.values():
            f.close()

    summary = {
        "games_parsed": games_parsed,
        "per_game": args.per_game,
        "min_ply": args.min_ply,
        "holdout_percent": 3,
        "bands": {
            band: {**counts, "target": targets[band]}
            for band, counts in stats.items()
        },
    }
    (args.out / "stats.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())