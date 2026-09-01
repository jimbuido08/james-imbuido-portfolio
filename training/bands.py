"""Band definitions — the single source of truth for rating thresholds and artifact names.

Every other training module imports from here; the browser's Difficulty union
(`types/chess.ts`) must stay aligned with BANDS.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Band:
    name: str
    lo: int  # inclusive
    hi: int  # exclusive (hi=None means unbounded)


# easy < 1200 <= medium < 1800 <= hard
BANDS: dict[str, Band] = {
    "easy": Band("easy", 0, 1200),
    "medium": Band("medium", 1200, 1800),
    "hard": Band("hard", 1800, 4000),
}

BAND_NAMES: tuple[str, ...] = tuple(BANDS)


def band_for_elo(elo: int) -> str | None:
    """Return the band name a numeric Elo belongs to, or None if outside all bands."""
    for band in BANDS.values():
        if band.lo <= elo < band.hi:
            return band.name
    return None


def model_filename(band: str) -> str:
    """The shipped ONNX artifact name for a band (must match the site's fetch path)."""
    if band not in BANDS:
        raise ValueError(f"unknown band: {band}")
    return f"chess-{band}.onnx"