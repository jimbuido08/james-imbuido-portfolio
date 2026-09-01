"""Policy network (~349k params) — one architecture, trained once per band.

Head layout (the contract's `policyIndex = fromIdx * 64 + toIdx`): the final
1×1 conv emits 64 channels interpreted as the FROM square and an 8×8 spatial
grid interpreted as the TO square, so a row-major flatten of (B, 64, 64)
already yields from*64 + to — no transpose needed.
"""

from __future__ import annotations

import torch
import torch.nn as nn

from encode import PLANES, POLICY_LOGITS, policy_index

WIDTH = 64
BLOCKS = 4


class ResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.relu(x + out)


class PolicyNet(nn.Module):
    def __init__(self, planes: int = PLANES, width: int = WIDTH) -> None:
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(planes, width, 3, padding=1, bias=False),
            nn.BatchNorm2d(width),
            nn.ReLU(inplace=True),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(width) for _ in range(BLOCKS)])
        self.head_conv = nn.Sequential(
            nn.Conv2d(width, width, 3, padding=1, bias=False),
            nn.ReLU(inplace=True),
        )
        self.policy_conv = nn.Conv2d(width, 64, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.blocks(x)
        x = self.head_conv(x)
        x = self.policy_conv(x)  # (B, 64_from, 8, 8) — channel = from square
        b = x.shape[0]
        x = x.reshape(b, 64, 64)  # (B, from, to)
        return x.reshape(b, POLICY_LOGITS)  # from*64 + to


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


# ---- Flip augmentation (implemented but OFF by default: horizontal mirroring
# must swap the castling channels and flip every label index, which is
# bug-prone; enable only with a verified parity check).

# Castling channel swap for a horizontal mirror: kingside <-> queenside,
# within own (12/13) and opp (14/15) groups.
_CASTLING_SWAP = list(range(PLANES))
_CASTLING_SWAP[12], _CASTLING_SWAP[13] = 13, 12
_CASTLING_SWAP[14], _CASTLING_SWAP[15] = 15, 14


def flip_planes_lr(planes: torch.Tensor) -> torch.Tensor:
    """Mirror a (17, 8, 8) tensor left-right, swapping castling channels."""
    swapped = planes[list(_CASTLING_SWAP)]
    return swapped.flip(-1)


def flip_index_lr(idx: int) -> int:
    """Mirror a model-frame square index left-right (file f -> 7-f)."""
    row, file = divmod(idx, 8)
    return row * 8 + (7 - file)


def flip_label_lr(label: int) -> int:
    from_idx, to_idx = divmod(label, 64)
    return policy_index(flip_index_lr(from_idx), flip_index_lr(to_idx))


def flip_labels_lr(labels: torch.Tensor) -> torch.Tensor:
    """Vectorized flip_label_lr over a batch of policy indices."""
    from_idx = labels // 64
    to_idx = labels % 64
    from_idx = (from_idx // 8) * 8 + (7 - from_idx % 8)
    to_idx = (to_idx // 8) * 8 + (7 - to_idx % 8)
    return from_idx * 64 + to_idx