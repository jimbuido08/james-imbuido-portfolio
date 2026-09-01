# Chess model training

Trains the three difficulty-band policy networks shipped as
`public/models/chess-{easy,medium,hard}.onnx`. Runs on James's Mac (Apple
Silicon, MPS) — never on Vercel.

See `docs/notes/chess-model-training.md` in the repo root for the full
contract, dataset recipe, hyperparameters, evaluation table, and limitations.

## Setup

The system Python is too old; use Anaconda's Python 3.12:

```bash
cd training
/opt/anaconda3/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Pipeline (in order)

| Step | Script | Purpose |
| --- | --- | --- |
| 1 | `stream_games.py` | Stream Lichess PGN.zst via curl → band TSVs in `data/` |
| 2 | `train.py` | Train one model per band → `checkpoints/<band>/` |
| 3 | `evaluate.py`, `selfcheck.py` | Masked metrics + legality self-check |
| 4 | `export_onnx.py`, `quantize.py` | ONNX candidates → `export/` |
| 5 | `make_fixtures.py` | Regenerate parity fixtures from the **shipped** artifacts |
| 6 | `play_eval.py` | Strength-ordering harness vs the heuristic opponents |

Band thresholds and filenames live only in `bands.py`. The board encoding —
the contract shared with `lib/chess/modelEncoding.ts` — lives only in
`encode.py`.

## Dataset

```bash
curl -sSL https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst \
  | .venv/bin/python stream_games.py --out data \
      --target easy:700000 medium:700000 hard:500000 --per-game 12 --min-ply 8
```

CC0-licensed Lichess data (https://database.lichess.org). Games are streamed
and never stored; only (fen, uci) samples land in `data/`, which is
git-ignored.

## Notes

- `training/` is excluded from Prettier (`.prettierignore`) and from the site
  build entirely.