#!/usr/bin/env python3
"""Fetch curated training corpora for the LLM Lab.

Reads corpus_sources.json (committed) and downloads each entry into
training/llm/data/ (git-ignored — data files are never committed, like the
chess stream_games.py datasets). To add a new corpus, append an entry to
corpus_sources.json (url, dest, license, note) and re-run; pass the printed
sha256 back into the manifest entry to pin it.

    python training/llm/fetch_corpus.py [--force]

Only stdlib; numpy not needed here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "corpus_sources.json"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "llm-lab-corpus-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp, dest.open("wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    parser.add_argument("--only", help="fetch a single manifest key")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ok = True
    for key, entry in manifest.items():
        if args.only and key != args.only:
            continue
        dest = HERE / entry["dest"]
        if dest.exists() and not args.force:
            print(f"[{key}] present: {dest.name} ({dest.stat().st_size:,} bytes, sha256 {sha256_of(dest)[:16]}…)")
        else:
            print(f"[{key}] fetching -> {dest}")
            try:
                fetch(entry["url"], dest)
            except Exception as exc:  # noqa: BLE001 — report and continue other keys
                print(f"[{key}] FAILED: {exc}")
                ok = False
                continue
            digest = sha256_of(dest)
            print(f"[{key}] {dest.stat().st_size:,} bytes, sha256 {digest}")
            expected = entry.get("sha256")
            if expected and expected != digest:
                print(f"[{key}] HASH MISMATCH (manifest pins {expected})")
                ok = False
            elif not expected:
                print(f"[{key}] record this sha256 in corpus_sources.json to pin it")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
