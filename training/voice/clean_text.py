"""Reference text frontend (Python) — mirrors synthesizer.utils.text for the
parity fixtures. The TypeScript mirror is lib/voice/textFrontend.ts; the
committed fixtures (text_cases in voice_fixtures.json) pin exact symbol-id
sequences so both sides must agree character for character.

The repo pipeline: unidecode → lowercase → expand numbers (inflect) → expand
abbreviations → collapse whitespace → symbol ids → EOS (~). Zero is the pad
symbol; the model masks attention on it.
"""

from __future__ import annotations

import sys
from pathlib import Path

RTVC = Path(__file__).resolve().parent / "_rtvc-src"
if not RTVC.is_dir():
    raise SystemExit(
        "reference repo missing — clone CorentinJ/Real-Time-Voice-Cloning to "
        f"{RTVC} (see README.md)"
    )
sys.path.insert(0, str(RTVC))

from synthesizer.hparams import hparams
from synthesizer.utils.text import text_to_sequence  # noqa: E402

# 5 fixture strings exercising the pipeline: plain ASCII; punctuation; an
# abbreviation; integers (year + plain); money + decimal; whitespace mess.
TEXT_CASES: list[str] = [
    "Hello world, this is a portfolio demo.",
    "Real-time voice cloning, in your browser!",
    "Dr. Smith joined in 2016 and still leads it.",
    "It costs $19.99, down from $50.00 (3.5 stars).",
    "I   typed   this   with   weird    spacing;  OK?",
]


def clean_and_sequence(text: str) -> list[int]:
    return text_to_sequence(text.strip(), hparams.tts_cleaner_names)


if __name__ == "__main__":
    for text in TEXT_CASES:
        ids = clean_and_sequence(text)
        print(f"{text!r} -> {ids}")