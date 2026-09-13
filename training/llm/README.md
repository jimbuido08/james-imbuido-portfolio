# LLM Lab training pipeline

Trains the sample checkpoint shipped as `public/models/llm/llm-portfolio.bin`
and generates the golden fixtures that keep the browser trainer honest. Runs
on James's machine — never on Vercel. Everything the browser does lives in
`lib/llm/`; this directory holds the offline side of the contract.

See `docs/notes/llm-model-training.md` for the architecture, the contract,
tolerances, gate numbers, and limitations.

## Pipeline (in order)

| Step | Script | Purpose |
| --- | --- | --- |
| 1 | `fetch_corpus.py` | Download curated corpora (Tiny Shakespeare; any URL added to `corpus_sources.json`) → git-ignored `data/` |
| 2 | `make_corpora.py` | Regenerate the bundled excerpts `lib/llm/bundledCorpus.ts` (Shakespeare slice) and `lib/llm/portfolioCorpus.ts` (approved site copy) — both committed |
| 3 | `make_fixtures.py` | Golden fixtures from the numpy reference (`reference.py`), incl. a finite-difference gradient self-check that fails loudly |
| 4 | `npm run verify:llm-model` | TS↔numpy parity + container + shipped-artifact regression (`scripts/verify-llm-model.ts`) |
| 5 | `train_sample.ts` | Train the sample via the same `lib/llm/trainLoop` the browser runs → `public/models/llm/*.bin` (fp16, plain git) |
| 6 | `record_expectations.ts` | Record exact-seed generations **from the shipped artifact** → `fixtures/sample_expectations.json`, then re-run step 4 |

Supporting: `probe.ts` (matmul GFLOP/s on this machine → tunes the preset step
defaults in `lib/llm/config.ts`).

## The shipped sample

```bash
python training/llm/fetch_corpus.py          # one-time: Tiny Shakespeare → data/
python training/llm/make_corpora.py          # regenerate both bundled corpora
npx tsx training/llm/train_sample.ts --preset small --corpus portfolio --steps 500 --batch 32 --seed 1
npx tsx training/llm/record_expectations.ts
npm run verify:llm-model
```

The portfolio corpus is tiny (~18 KB), so the sample memorises it by design —
recitation and remixing is the demo's point, and the site copy says so. To
retrain on edited site copy, re-run `make_corpora.py` (James reviews the
regenerated `portfolioCorpus.ts`), then steps 5–6.

## Notes

- `training/` is excluded from Prettier (`.prettierignore`) and from the site
  build's runtime, but `.ts` files here are still type-checked — keep them
  clean.
- `data/` is git-ignored (the shared `training/.gitignore` rule); fixtures and
  the shipped artifact are committed.
