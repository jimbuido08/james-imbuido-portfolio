"""Position encoding — the Python half of the training↔inference contract.

`lib/chess/modelEncoding.ts` implements the identical contract in TypeScript;
`training/fixtures/golden_positions.json` proves the two agree.

Contract (do not change without updating the TS side AND the fixtures):

Input  — ONNX input name `board`, shape [1, 17, 8, 8], float32, values 0.0/1.0,
         built from the 6-field FEN string only (no chess-library internals).
Output — ONNX output name `policy`, shape [1, 4096], float32, flat index
         `policyIndex = fromIdx * 64 + toIdx` (model frame), promotion-blind.

Channels, always relative to the side to move:
    0..5   own  pawn, knight, bishop, rook, queen, king
    6..11  opp  pawn, knight, bishop, rook, queen, king
    12     own  kingside castling right
    13     own  queenside castling right
    14     opp  kingside castling right
    15     opp  queenside castling right
    16     en-passant target square

Perspective: White to move → board as-is; Black to move → board mirrored
vertically (rank r → 9−r), so the mover's back rank is always row 0.
Layout: plane[row][file], row 0..7 = rank 1..8 in the model frame,
file = a..h; idx = row*8 + file; mirror map idx' = (7−row)*8 + file.
Castling planes come from FEN field 3 remapped by side to move.
En-passant plane = 1 at idx(epSquare) from FEN field 4 verbatim ('-' → zeros).
Castling moves are encoded king-from → king-to (e1g1).
"""

from __future__ import annotations

import hashlib

import numpy as np

PLANES = 17
BOARD_SIDE = 8
POLICY_LOGITS = 4096

PIECE_CHANNELS = {"p": 0, "n": 1, "b": 2, "r": 3, "q": 4, "k": 5}

# Own/opp castling plane offsets, indexed by side to move ('w'/'b').
# (own_kingside, own_queenside, opp_kingside, opp_queenside)
CASTLING_PLANES = {
    "w": {"K": 12, "Q": 13, "k": 14, "q": 15},
    "b": {"k": 12, "q": 13, "K": 14, "Q": 15},
}

EP_PLANE = 16


def _file_of(square: str) -> int:
    return ord(square[0]) - ord("a")


def _rank_of(square: str) -> int:
    return int(square[1])


def square_index(square: str, mirror: bool) -> int:
    """Model-frame index of a square. mirror=True when Black is to move."""
    file = _file_of(square)
    rank = _rank_of(square)
    row = (8 - rank) if mirror else (rank - 1)
    return row * 8 + file


def index_to_square(idx: int, mirror: bool) -> str:
    """Inverse of square_index — model-frame idx back to algebraic."""
    row, file = divmod(idx, 8)
    rank = (8 - row) if mirror else (row + 1)
    return f"{chr(ord('a') + file)}{rank}"


def mirror_index(idx: int) -> int:
    """Vertical mirror map: idx' = (7−row)*8 + file."""
    row, file = divmod(idx, 8)
    return (7 - row) * 8 + file


def policy_index(from_idx: int, to_idx: int) -> int:
    """Flat policy index for a from→to pair (model frame)."""
    return from_idx * 64 + to_idx


def _parse_fen(fen: str) -> tuple[list[list[str]], str, str, str]:
    """Split a FEN into (ranks[0..7] for ranks 8..1 as 8-char lists, turn, castling, ep)."""
    fields = fen.strip().split()
    if len(fields) != 6:
        raise ValueError(f"expected 6-field FEN, got {len(fields)} fields: {fen!r}")
    board, turn, castling, ep = fields[0], fields[1], fields[2], fields[3]
    if turn not in ("w", "b"):
        raise ValueError(f"bad side to move: {turn!r}")
    ranks = board.split("/")
    if len(ranks) != 8:
        raise ValueError(f"expected 8 ranks in FEN board, got {len(ranks)}")
    grid: list[list[str]] = []
    for rank_str in ranks:
        row: list[str] = []
        for ch in rank_str:
            if ch.isdigit():
                row.extend([""] * int(ch))
            else:
                row.append(ch)
        if len(row) != 8:
            raise ValueError(f"rank does not span 8 files: {rank_str!r}")
        grid.append(row)
    return grid, turn, castling, ep


def encode_position(fen: str) -> np.ndarray:
    """Encode a 6-field FEN into the [17, 8, 8] float32 input tensor."""
    grid, turn, castling, ep = _parse_fen(fen)
    mirror = turn == "b"
    planes = np.zeros((PLANES, BOARD_SIDE, BOARD_SIDE), dtype=np.float32)

    for r in range(8):  # grid[r] is FEN rank 8-r, files a..h
        rank = 8 - r
        for f in range(8):
            piece = grid[r][f]
            if not piece:
                continue
            base = PIECE_CHANNELS[piece.lower()]
            # Own = the mover's pieces: uppercase when White is to move,
            # lowercase when Black is.
            own = (piece.isupper() and turn == "w") or (
                piece.islower() and turn == "b"
            )
            channel = base if own else base + 6
            idx = square_index(f"{chr(ord('a') + f)}{rank}", mirror)
            planes[channel, idx // 8, idx % 8] = 1.0

    for flag, channel in CASTLING_PLANES[turn].items():
        if flag in castling:
            planes[channel, :, :] = 1.0

    if ep != "-":
        idx = square_index(ep, mirror)
        planes[EP_PLANE, idx // 8, idx % 8] = 1.0

    return planes


def bool_planes(planes: np.ndarray) -> np.ndarray:
    """Cast an encoded tensor to the bool layout used for digests/parity."""
    return planes.astype(bool)


def pack_planes(planes: np.ndarray) -> bytes:
    """Pack the 17×8×8 bit planes into 136 bytes, MSB-first, row-major."""
    return np.packbits(bool_planes(planes).reshape(-1)).tobytes()


def digest_planes(planes: np.ndarray) -> str:
    """SHA-256 hex digest of pack_planes — the parity fixture key."""
    return hashlib.sha256(pack_planes(planes)).hexdigest()


def uci_to_label(uci: str, mirror: bool) -> tuple[int, int] | None:
    """UCI move → (from_idx, to_idx) in the model frame.

    Returns None for non-queen promotions (queen-only policy: they are dropped
    at training and queen is picked at inference).
    """
    if len(uci) not in (4, 5):
        raise ValueError(f"bad UCI move: {uci!r}")
    promo = uci[4] if len(uci) == 5 else None
    if promo is not None and promo != "q":
        return None
    from_idx = square_index(uci[0:2], mirror)
    to_idx = square_index(uci[2:4], mirror)
    return from_idx, to_idx