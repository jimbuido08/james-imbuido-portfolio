# Chess model training — contract, pipeline, and results

How the three difficulty-band policy networks in `public/models/chess-{easy,medium,hard}.onnx`
were trained, and the encoding contract every artifact obeys. The training
pipeline lives in `training/` (see `training/README.md`) and runs on James's
Mac (Apple Silicon, MPS) — never on Vercel.

## The contract (single source of truth)

Python (`training/encode.py`, training side) and TypeScript
(`lib/chess/modelEncoding.ts`, inference side) implement it independently;
`training/fixtures/golden_positions.json` proves they agree and
`npm run verify:chess-model` re-proves it on every change. The contract is
written once — here — and mirrored verbatim in both files' doc comments.

**Input** — ONNX input name `board`, shape `[1, 17, 8, 8]`, float32, values
exactly 0.0/1.0, built from the 6-field FEN string only (no chess-library
internals).

Channels, always relative to the side to move:

```
0..5   own  pawn, knight, bishop, rook, queen, king
6..11  opp  pawn, knight, bishop, rook, queen, king
12     own  kingside castling right
13     own  queenside castling right
14     opp  kingside castling right
15     opp  queenside castling right
16     en-passant target square
```

- **Perspective:** White to move → board as-is; Black to move → board
  mirrored vertically (rank `r` → `9−r`), so the mover's back rank is always
  row 0. No side-to-move plane (it would be constant).
- **Layout:** `plane[row][file]`, row 0..7 = rank 1..8 in the model frame,
  file = a..h; `idx = row*8 + file`; mirror map `idx' = (7−row)*8 + file`.
- **Castling planes** from FEN field 3 remapped by side to move (Black to
  move: `k`→ch12, `q`→ch13, `K`→ch14, `Q`→ch15).
- **En-passant** plane = 1 at `idx(epSquare)` from FEN field 4 verbatim
  (`-` → zeros). Both sides use the FEN as-is. Both python-chess (training)
  and chess.js (site) only emit the ep square when a capture is actually
  possible, so the conventions line up.
- Castling moves are encoded `king-from → king-to` (`e1g1`).

**Output** — ONNX output name `policy`, shape `[1, 4096]`, float32, flat
index **`logitIndex = fromIdx * 64 + toIdx`** (model frame),
promotion-blind.

**Decoding:** never invert logits. Iterate `input.legal`, score each via
`policyIndex`, argmax; ties keep the first move in legal-move order (the same
position always gets the same reply). Promotion dedup: one score per
(from, to) pair, with the queen variant returned to the engine.

**Promotions:** queen-only policy — non-queen promotion labels were dropped
at training (~0.5% of moves); the queen is picked at inference. Documented
limitation, not a bug.

**Selection:** argmax for all three bands. Weakness comes from the training
data; determinism means the same position gets the same reply (debuggable,
and exactly what `model_expectations.json` regression-tests).

## Bands and data

One architecture (346,880 params — stem Conv 17→64 + 4 residual blocks 64ch
+ policy head), trained three times:

| Band  | Training games (Lichess Elo of BOTH players) | Samples   |
| ----- | -------------------------------------------- | --------- |
| easy  | < 1200                                        | 700,001   |
| medium| 1200–1799                                     | 2,737,498 |
| hard  | ≥ 1800                                        | 2,125,797 |

Dataset: Lichess open rated games, `lichess_db_standard_rated_2024-01.pgn.zst`
(CC0), streamed (curl-piped, ~6 GB) — games are never stored; only
`(fen, uci, legal_moves)` samples land in `training/data/<band>/` (git-ignored,
regenerable). Filters: Standard variant, not Abandoned/Unterminated,
TimeControl base ≥ 60s, ≥ 16 plies, samples only from ply ≥ 8, ≤ 12 per game
(deterministic header-hash stride), per-band FEN dedup. 3% of games held out
for validation by game hash. Non-queen promotion labels dropped.

## Training

AdamW lr 2e-3 (200-step warmup → cosine), weight decay 1e-4, batch 512,
4 epochs, best-on-validation checkpoint, grad clip 1.0, fp32 on MPS (bf16
autocast is flaky there). CrossEntropy over all 4096 logits unmasked —
inference masks by legality, and the deployment-honest numbers below are
masked. Flip augmentation is implemented in `training/model.py` but OFF by
default (label/castling mirroring is bug-prone).

## Evaluation

Masked top-1 on held-out val positions (deployment rule = mask legality,
argmax; ties keep the first legal move in board order):

| Band   | top-1 (unmasked) | top-1 (masked) | top-3 (masked) | argmax legal |
| ------ | ---------------- | -------------- | -------------- | ------------ |
| easy   | 0.366            | 0.383          | 0.640          | 0.957        |
| medium | 0.414            | 0.422          | 0.688          | 0.981        |
| hard   | 0.404            | 0.413          | 0.680          | 0.980        |

(Trained-model checkpoint metrics on each band's full held-out val split —
`training/evaluate.py`. top-1 is not comparable *across* bands: each model is
measured against the move distribution of its own Elo pool, and stronger
players are harder to predict. The deployment-honest number is the masked
column; all bands clear the 35% bar. Which model is actually stronger is
settled by the play-offs below, not by these percentages.)

## Artifacts

Exported opset 17, fixed shape, names `board`/`policy`
(`training/export_onnx.py`), then quantized (`training/quantize.py`) and
gated (`training/gate.py`) against the fp32 export on: identical masked top-1
on the 12 golden FENs, ≥98% argmax agreement on 200 val positions, ≤1.0
top-1-point drop. The smallest passing candidate ships.

All three bands gated 2026-09-01 (`training/gate.py`, 200 val positions per
candidate):

| Band   | int8 (0.35 MB)                                  | fp16 (0.67 MB) → ships |
| ------ | ----------------------------------------------- | ---------------------- |
| easy   | golden pick changed, agreement 96.0% → REJECT   | 100% agree, 0.0pt drop |
| medium | golden pick changed, agreement 95.5% → REJECT   | 100% agree, 0.0pt drop |
| hard   | golden pick changed, agreement 93.5% → REJECT   | 100% agree, 0.0pt drop |

int8 was additionally smoke-tested under the ORT-web wasm backend (loads and
runs) but the gate rejects it on all three bands, so **fp16 ships**: half the
fp32 size (1.33 MB → 0.67 MB) with byte-identical masked behaviour on the
golden FENs and full val agreement. `quantize.py` converts with
`keep_io_types=True` so the browser's float32 `board`/`policy` I/O is
untouched. Shipped as `public/models/chess-{easy,medium,hard}.onnx`
(699,856 bytes each); `model_expectations.json` regenerated from the shipped
artifacts and `npm run verify:chess-model` reproduces all 12 golden top-1
picks per band under the ORT-web wasm runtime — the same backend the browser
uses. Each artifact also passed `training/selfcheck.py` (2,000 val positions,
every choice legal and finite).

## Strength ordering

`training/play_eval.py` plays the exported artifacts against ports of the
site's three heuristic opponents (the pre-model stand-ins) and against each
other, 20 games per pairing with colours swapped:

Results (seed 20260901, 20 games per pairing, win / loss / draw):

| Model | vs heuristic-easy | vs heuristic-medium | vs heuristic-hard (depth-2) |
| ----- | ----------------- | ------------------- | --------------------------- |
| easy  | 85 / 0 / 15       | 60 / 0 / 40         | 10 / 65 / 25                |
| medium| 80 / 0 / 20       | 70 / 0 / 30         | 25 / 30 / 45                |
| hard  | 70 / 0 / 30       | 60 / 0 / 40         | **50 / 20 / 30**            |

- Every model crushes random (no losses) and the material heuristic (no
  losses). easy is the only band that loses to the depth-2 search heuristic
  (10–65) — the ordering easy < medium, hard is unambiguous.
- The acceptance criterion holds: the hard model beats the depth-2 heuristic
  with a majority (50 / 20). medium is roughly even with it (25 / 30 / 45).
- Model-vs-model pairings are draw-heavy and weakly informative: both bots
  pick moves deterministically (argmax), so a 20-game pairing collapses to
  ~2 distinct lines — one per colour. easy lost every decided game against
  medium and hard (0 / 50 / 50 twice); medium vs hard came out 50 / 0 / 50,
  i.e. one opening line where medium converted its wins. The meaningful
  strength signal between medium and hard is the search-opponent column
  above, where hard clearly outperforms medium.

## Site integration

- `lib/chess/opponents.ts` loads a difficulty's artifact lazily on first AI
  turn (or on difficulty pick, via `warmupOpponent`), keeps one session
  promise per difficulty for the page's lifetime, and falls back to the
  heuristic opponents on any failure — a missing/broken artifact can never
  break the game.
- ORT runtime is self-hosted (`public/models/ort/`, `npm run models:wasm`)
  and single-threaded wasm (no COOP/COEP headers needed); the model chunk is
  a dynamic import, never in the `/` bundle.
- `npm run verify:chess-model` re-checks encoding parity and artifact
  expectations (`training/fixtures/model_expectations.json`) on every change.
- `/models/*` responses carry `Cache-Control: public, max-age=86400,
  stale-while-revalidate=604800`.

## Limitations

- Queen-only promotions (see above).
- Argmax determinism: no temperature — a drawn position repeats the same
  line. The one-line knob (sample from softmax) exists in
  `lib/chess/opponents.ts` if easy ever needs to feel less repetitive.
- The model is a policy net over moves played by humans in the band; it has
  no search behind it, so tactical oversights at the hard band are expected
  relative to engines.