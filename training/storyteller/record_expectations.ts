/**
 * Record the shipped storyteller container's seeded generations as regression
 * expectations — FROM THE SHIPPED fp16 ARTIFACT via the same TypeScript
 * generate the worker runs (never an fp32 master; fp16 quantization changes
 * generations — the chess lesson, twice over).
 *
 * Run on James's machine after any re-export:  npx tsx training/storyteller/record_expectations.ts
 * Then re-run npm run verify:storyteller-model (check 7 goes green).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mulberry32 } from "../../lib/llm/prng";
import { TOP_K } from "../../lib/storyteller/config";
import { decodeStoryteller } from "../../lib/storyteller/container";
import { buildTokenizer } from "../../lib/storyteller/tokenizer";
import { createStorytellerModel, generateStoryteller } from "../../lib/storyteller/model";
import { crc32 } from "../../lib/llm/artifact";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BIN_PATH = `${ROOT}public/models/storyteller/storyteller.bin`;
const TOK_PATH = `${ROOT}public/models/storyteller/tokenizer.json`;
const OUT_DIR = `${ROOT}training/storyteller/fixtures`;
const OUT_PATH = `${OUT_DIR}/storyteller_expectations.json`;

const CASES = [
  { seed: 11, prompt: "Once upon a time", maxTokens: 200, temperature: 0.8 },
  { seed: 7, prompt: "", maxTokens: 120, temperature: 0.8 },
  { seed: 21, prompt: "Once upon a time", maxTokens: 120, temperature: 1.0 },
];

async function main(): Promise<void> {
  const bin = new Uint8Array(readFileSync(BIN_PATH));
  const tok = buildTokenizer(readFileSync(TOK_PATH, "utf8"));
  const decoded = decodeStoryteller(bin);

  const cases: {
    seed: number;
    prompt: string;
    maxTokens: number;
    temperature: number;
    topK: number;
    promptIdsUsed: number[];
    ids: number[];
  }[] = [];
  for (const c of CASES) {
    let promptIds = Array.from(tok.encode(c.prompt));
    if (promptIds.length === 0) promptIds = [tok.eotId]; // fresh story
    const model = createStorytellerModel(decoded);
    const res = await generateStoryteller(model, promptIds, {
      maxTokens: c.maxTokens,
      temperature: c.temperature,
      topK: TOP_K,
      rng: mulberry32(c.seed),
    });
    const ids = Array.from(res.ids);
    console.log(
      `seed ${c.seed} ${JSON.stringify(c.prompt)} -> ${res.tokensGenerated} tokens, ${ids.length} ids total`,
    );
    cases.push({
      seed: c.seed,
      prompt: c.prompt,
      maxTokens: c.maxTokens,
      temperature: c.temperature,
      topK: TOP_K,
      promptIdsUsed: promptIds,
      ids,
    });
  }

  const out = {
    note:
      "Seeded generations recorded FROM the shipped fp16 storyteller.bin via the same lib/storyteller generate the browser worker runs (TS-to-TS bit-exact; never from an fp32 master). Re-record after any re-export.",
    artifacts: {
      "storyteller.bin": {
        crc32: crc32(bin),
        config: decoded.config,
        paramCount: decoded.paramCount,
        cases,
      },
    },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});