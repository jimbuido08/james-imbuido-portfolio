/**
 * Offline trainer for James's shipped sample — runs the SAME lib/llm modules
 * the browser worker uses (trainModel), just with a bigger batch and no UI.
 * This is the "train an LLM from the workflow" artifact pipeline; run it
 * locally (never on Vercel — the chess/voice training precedent):
 *
 *   npx tsx training/llm/train_sample.ts --preset small --corpus portfolio \
 *     --steps 500 --batch 32 --seed 1 --out public/models/llm/llm-portfolio.bin
 *
 * Then regenerate the regression expectations from the SHIPPED fp16 file:
 *
 *   npx tsx training/llm/record_expectations.ts
 *
 * and gate it: npm run verify:llm-model
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { PRESETS, type PresetKey } from "../../lib/llm/config";
import { encodeArtifact } from "../../lib/llm/artifact";
import { encodeBytes } from "../../lib/llm/tokenizer";
import { trainModel } from "../../lib/llm/trainLoop";
import { BUNDLED_CORPUS } from "../../lib/llm/bundledCorpus";
import { PORTFOLIO_CORPUS } from "../../lib/llm/portfolioCorpus";

const { values } = parseArgs({
  options: {
    preset: { type: "string", default: "small" },
    corpus: { type: "string", default: "portfolio" },
    steps: { type: "string", default: "500" },
    batch: { type: "string", default: "32" },
    seed: { type: "string", default: "1" },
    out: {
      type: "string",
      default: "public/models/llm/llm-portfolio.bin",
    },
  },
});

async function main(): Promise<void> {
  const presetKey = values.preset as PresetKey;
  const preset = PRESETS[presetKey];
  if (!preset) throw new Error(`unknown preset "${values.preset}"`);
  const text =
    values.corpus === "portfolio"
      ? PORTFOLIO_CORPUS
      : values.corpus === "bundled"
        ? BUNDLED_CORPUS
        : (() => {
            throw new Error(`unknown corpus "${values.corpus}" (portfolio|bundled)`);
          })();
  const corpus = encodeBytes(text);
  const steps = Math.max(1, Number(values.steps));
  const batch = Math.max(1, Number(values.batch));
  const seed = Number(values.seed) >>> 0;

  console.log(
    `training: preset=${presetKey} corpus=${values.corpus} (${corpus.length.toLocaleString()} bytes) ` +
      `steps=${steps} batch=${batch} seed=${seed}`,
  );
  const t0 = performance.now();
  const result = await trainModel(corpus, preset, {
    steps,
    seed,
    batchSize: batch,
    sampleEvery: Math.max(1, Math.floor(steps / 10)),
    onProgress: (p) => {
      const pct = Math.round((100 * p.step) / p.totalSteps);
      console.log(
        `  step ${p.step}/${p.totalSteps} (${pct}%)  loss ${p.loss.toFixed(4)}  ema ${p.lossEma.toFixed(4)}` +
          `  ${Math.round(p.tokensPerSec).toLocaleString()} tok/s` +
          (p.sample !== undefined ? `\n    sample: ${JSON.stringify(p.sample)}` : ""),
      );
    },
  });

  const bytes = Buffer.from(encodeArtifact(result.model, 1));
  const outPath = fileURLToPath(new URL(`../../${values.out}`, import.meta.url));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  console.log(
    `\nwrote ${values.out} — ${bytes.length.toLocaleString()} bytes (fp16), sha256 ${sha}`,
  );
  console.log(
    `final loss (EMA) ${result.finalLoss.toFixed(4)} nats/byte · ${result.steps} steps · ` +
      `${((performance.now() - t0) / 60000).toFixed(1)} min — cancelled=${result.cancelled}`,
  );
  console.log("next: npx tsx training/llm/record_expectations.ts && npm run verify:llm-model");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
