"""TSV-backed dataset: on-the-fly encoding of (fen, uci, legal) samples."""

from __future__ import annotations

import torch
from torch.utils.data import Dataset

from encode import encode_position, uci_to_label


class BandDataset(Dataset):
    """Reads a stream_games.py TSV (fen \t uci \t legal…) and encodes lazily.

    Labels are `policy_index(from, to)` in the model frame; non-queen
    promotions (already dropped by the streamer) would encode to None.
    """

    def __init__(self, tsv_path: str) -> None:
        self.rows: list[tuple[str, str, list[str]]] = []
        with open(tsv_path, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 2 or not parts[0]:
                    continue
                legal = parts[2].split() if len(parts) >= 3 else []
                self.rows.append((parts[0], parts[1], legal))
        if not self.rows:
            raise ValueError(f"empty dataset: {tsv_path}")

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        fen, uci, _legal = self.rows[idx]
        mirror = fen.split()[1] == "b"
        planes = encode_position(fen)
        label_pair = uci_to_label(uci, mirror)
        if label_pair is None:
            raise ValueError(f"non-queen promotion label in dataset: {uci!r}")
        from_idx, to_idx = label_pair
        return torch.from_numpy(planes), from_idx * 64 + to_idx

    def legal_sets(self) -> list[list[int]]:
        """Policy indices of every legal move per row (masked-eval input).

        Non-queen promotions share their from/to index with the queen move, so
        dropping them here changes nothing.
        """
        result: list[list[int]] = []
        for fen, _uci, legal in self.rows:
            mirror = fen.split()[1] == "b"
            moves: list[int] = []
            for uci in legal:
                pair = uci_to_label(uci, mirror)
                if pair is not None:
                    moves.append(pair[0] * 64 + pair[1])
            result.append(moves)
        return result


def collate(batch: list[tuple[torch.Tensor, int]]) -> tuple[torch.Tensor, torch.Tensor]:
    xs = torch.stack([b[0] for b in batch])
    ys = torch.tensor([b[1] for b in batch], dtype=torch.long)
    return xs, ys