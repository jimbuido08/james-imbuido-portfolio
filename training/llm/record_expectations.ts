/**
 * Records generation expectations for EVERY artifact in public/models/llm/
 * into training/llm/fixtures/sample_expectations.json — the regression table
 * the verify gate replays exactly (same TS code, same V8 engine semantics as
 * the browser). Regenerate from the SHIPPED artifacts (never from the fp32
 * master — the fp16 quantization changes generations; the chess fp16 lesson).
 *
 *   npx tsx training/llm/record_expectations.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { crc32, decodeArtifact } from "../../lib/llm/artifact";
import { createWorkspace, generate } from "../../lib/llm/model";
import { encodeBytes } from "../../lib/llm/tokenizer";

const ARTIFACT_DIR = fileURLToPath(new URL("../../public/models/llm", import.meta.url));
const OUT = fileURLToPath(
  new URL("./fixtures/sample_expectations.json", import.meta.url),
);

/** The fixed regression cases — change deliberately and regenerate. */
const CASES = [
  { seed: 11, prompt: "James", maxTokens: 96, temperature: 0.8 },
  { seed: 7, prompt: "", maxTokens: 96, temperature: 0.8 },
] as const;

function main(): void {
  const files = readdirSync(ARTIFACT_DIR).filter((f) => f.endsWith(".bin"));
  if (files.length === 0) {
    console.log("no artifacts in public/models/llm/ — train one first (train_sample.ts)");
    process.exitCode = 1;
    return;
  }
  const artifacts: Record<string, unknown> = {};
  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(join(ARTIFACT_DIR, file)));
    const model = decodeArtifact(bytes);
    const gws = createWorkspace(model.config, 1, model.config.ctxLen, false);
    const cases = CASES.map((c) => ({
      ...c,
      ids: Array.from(
        generate(model, gws, encodeBytes(c.prompt), {
          maxTokens: c.maxTokens,
          temperature: c.temperature,
          seed: c.seed,
        }),
      ),
    }));
    artifacts[file] = {
      crc32: crc32(bytes),
      config: model.config,
      params: model.weights.length,
      cases,
    };
    console.log(`${file}: recorded ${cases.length} generation cases (crc ${crc32(bytes).toString(16)})`);
  }
  writeFileSync(OUT, JSON.stringify({ note: "Regenerate with training/llm/record_expectations.ts from the shipped artifacts.", artifacts }, null, 2));
  console.log(`wrote fixtures/sample_expectations.json for ${files.length} artifact(s)`);
}

main();
