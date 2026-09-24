# Storyteller training/export pipeline

Runs on James's machine — never on Vercel. Python deps (torch, numpy,
tokenizers) live in the sibling `llm-from-scratch` venv
(`C:/Users/User/Documents/Repositories/dev/llm-from-scratch/.venv`);
TypeScript steps run via the portfolio's `npx tsx`. This folder is excluded
from Prettier but still type-checked; the 83 MB checkpoint is read in place
from the sibling repo — never copied, never committed. Fixtures, the shipped
artifacts, and `training_log.json` ARE committed.

| Step | Script | Purpose |
|---|---|---|
| 0 | (one-time) `training_log.json` | The measured run's 41 eval points + 16 mid-train samples, extracted from the 2026-09-22 training log |
| 1 | `export.py` | Sibling ckpt → `public/models/storyteller/storyteller.bin` (fp16 STOR v1, tied head deduped) + byte-identical `tokenizer.json` + generated `lib/storyteller/trainingData.ts`; self-checks logits + greedy paths against the fp32 master |
| 2 | `make_fixtures.py` | Golden fixtures from the numpy mirror (`reference.py`) over the SHIPPED container → `fixtures/storyteller_fixtures.json` |
| 3 | `npm run verify:storyteller-model` | TS-vs-Python parity gate (`scripts/verify-storyteller-model.ts`, 61 checks) |
| 4 | `record_expectations.ts` | Seeded generations **from the shipped container** → `fixtures/storyteller_expectations.json`, then re-run step 3 |

Re-run 1→4 after any retrain or re-export. Architecture and gate numbers:
`docs/notes/storyteller-architecture.md`.