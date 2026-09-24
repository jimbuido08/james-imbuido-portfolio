/**
 * verify:storyteller-model — the storyteller parity gate.
 *
 * Proves the TypeScript port (lib/storyteller/) agrees with the Python golden
 * fixtures and the SHIPPED artifacts:
 *   1. tokenizer encode is exact (10 cases incl. contractions, CJK, emoji,
 *      the literal "[EOT]", empty) and both decode modes match (the default
 *      skips special tokens — how the training samples were decoded)
 *   2. container: header/crc32/size vs constants + human-sentence rejection
 *      of corruption (bad magic, bad version, truncation, flipped payload
 *      byte, bad paramCount)
 *   3. fp16 spot bit-patterns decode to the exact f32 values (pins the
 *      shared lib/llm/artifact.ts codec)
 *   4. RoPE tables match the numpy mirror at tolerance
 *   5. forward logits match at tolerance + argmax and greedy continuation ids
 *      are exact
 *   6. param count is 6,917,376 end to end
 *   7. shipped-artifact generation regression vs fixtures/storyteller_expectations.json
 *      (skip-when-absent, FAIL-when-present-but-unrecorded — the chess/llm
 *      convention; expectations are recorded FROM the shipped fp16 container)
 *   8. the generated trainingData.ts matches training_log.json (drift guard)
 *
 * Run: npm run verify:storyteller-model (exit 1 on any failure).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mulberry32 } from "../lib/llm/prng";
import { crc32, f16BitsToF32 } from "../lib/llm/artifact";
import {
  EXPECTED_PARAMS,
  MODEL_BYTES,
  STORYTELLER_CONFIG,
  TOKENIZER_BYTES,
  storytellerParamCount,
} from "../lib/storyteller/config";
import {
  decodeStoryteller,
  STOR_HEADER_BYTES,
} from "../lib/storyteller/container";
import { buildTokenizer } from "../lib/storyteller/tokenizer";
import {
  createStorytellerModel,
  generateStoryteller,
  prefillStoryteller,
} from "../lib/storyteller/model";
import {
  LOSS_POINTS,
  EVOLUTION_SAMPLES,
} from "../lib/storyteller/trainingData";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN_PATH = `${ROOT}public/models/storyteller/storyteller.bin`;
const TOK_PATH = `${ROOT}public/models/storyteller/tokenizer.json`;
const FIXTURES_PATH = `${ROOT}training/storyteller/fixtures/storyteller_fixtures.json`;
const EXPECTATIONS_PATH = `${ROOT}training/storyteller/fixtures/storyteller_expectations.json`;
const LOG_PATH = `${ROOT}training/storyteller/training_log.json`;

let checks = 0;
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

/** Fixture tolerance: abs 1e-5 OR rel 1e-3 on 5-significant-digit values. */
function close(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d <= 1e-5 || d <= 1e-3 * Math.max(Math.abs(a), Math.abs(b));
}

function expectThrow(label: string, fn: () => void): void {
  try {
    fn();
    check(label, false, "no error thrown");
  } catch (err) {
    check(label, true, err instanceof Error ? err.message : "");
  }
}

async function main(): Promise<void> {
  const bin = new Uint8Array(readFileSync(BIN_PATH));
  const tokText = readFileSync(TOK_PATH, "utf8");
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

  // ---- 1. tokenizer ----
  const tok = buildTokenizer(tokText);
  check(
    "tokenizer: byte size",
    // Normalise line endings first so the assertion holds on any checkout.
    // Comparing raw bytes made this pass only where core.autocrlf rewrote the
    // working tree to CRLF, and fail on every LF checkout.
    Buffer.byteLength(tokText.replace(/\r\n/g, "\n"), "utf8") ===
      TOKENIZER_BYTES,
  );
  for (const c of fixtures.tokenizerCases) {
    const ids = tok.encode(c.text);
    const idsOk =
      ids.length === c.ids.length &&
      Array.from(ids).every((v, i) => v === c.ids[i]);
    check(`tokenizer: encode ${JSON.stringify(c.text).slice(0, 28)}`, idsOk);
    if (idsOk) {
      check(
        `tokenizer: decodeDefault ${JSON.stringify(c.text).slice(0, 28)}`,
        tok.decode(ids) === c.decodeDefault,
      );
    }
  }
  for (const c of fixtures.decodeCases) {
    check(
      `tokenizer: decode both modes (${JSON.stringify(c.textNoSkip).slice(0, 24)})`,
      tok.decode(c.ids) === c.textDefault &&
        tok.decode(c.ids, false) === c.textNoSkip,
    );
  }

  // ---- 2. container ----
  check(
    "container: byte size",
    bin.length === MODEL_BYTES,
    `${bin.length.toLocaleString()} B`,
  );
  const decoded = decodeStoryteller(bin);
  check(
    "container: header config",
    decoded.config.nLayer === STORYTELLER_CONFIG.nLayer &&
      decoded.config.nEmbd === STORYTELLER_CONFIG.nEmbd &&
      decoded.config.nHead === STORYTELLER_CONFIG.nHead &&
      decoded.config.ctxLen === STORYTELLER_CONFIG.ctxLen &&
      decoded.config.vocabSize === STORYTELLER_CONFIG.vocabSize,
  );
  check(
    "container: crc32 matches fixture",
    crc32(bin.subarray(STOR_HEADER_BYTES)) === fixtures.container.header.crc32,
  );
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  expectThrow("container: rejects bad magic", () => {
    const bad = bin.slice();
    bad[0] ^= 0xff;
    decodeStoryteller(bad);
  });
  expectThrow("container: rejects bad version", () => {
    const bad = bin.slice();
    new DataView(bad.buffer).setUint16(4, 2, true);
    decodeStoryteller(bad);
  });
  expectThrow("container: rejects truncation", () => {
    decodeStoryteller(bin.subarray(0, bin.length - 2));
  });
  expectThrow("container: rejects flipped payload byte", () => {
    const bad = bin.slice();
    bad[STOR_HEADER_BYTES + 1000] ^= 0x01;
    decodeStoryteller(bad);
  });
  expectThrow("container: rejects bad paramCount", () => {
    const bad = bin.slice();
    new DataView(bad.buffer).setUint32(16, 12345, true);
    decodeStoryteller(bad);
  });

  // ---- 3. fp16 spot codec ----
  for (const spot of fixtures.fp16Spots) {
    const bits = dv.getUint16(STOR_HEADER_BYTES + spot.index * 2, true);
    const value = f16BitsToF32(bits);
    check(
      `fp16 spot ${spot.index}`,
      bits === spot.bits && value === spot.value,
      `bits ${bits.toString(16)} value ${value}`,
    );
  }

  // ---- 4. RoPE tables ----
  const model = createStorytellerModel(decoded);
  const cosOk = fixtures.rope.cos8x16.every((v: number, i: number) =>
    close(v, model.ropeCos[i]),
  );
  const sinOk = fixtures.rope.sin8x16.every((v: number, i: number) =>
    close(v, model.ropeSin[i]),
  );
  check("rope: cos table (8×16)", cosOk);
  check("rope: sin table (8×16)", sinOk);

  // ---- 5. forward parity + greedy ----
  for (const c of fixtures.forwardCases) {
    const logits = prefillStoryteller(model, c.ids);
    const firstOk = c.logitsFirst64.every((v: number, i: number) =>
      close(v, logits[i]),
    );
    check(`forward: first-64 logits (${JSON.stringify(c.prompt)})`, firstOk);
    const topOk = c.logitsTop32.every((t: { id: number; value: number }) =>
      close(t.value, logits[t.id]),
    );
    check(`forward: top-32 logits (${JSON.stringify(c.prompt)})`, topOk);
    let argmaxId = 0;
    for (let i = 1; i < logits.length; i++)
      if (logits[i] > logits[argmaxId]) argmaxId = i;
    check(
      `forward: argmax id (${JSON.stringify(c.prompt)})`,
      argmaxId === c.argmaxId,
      `got ${argmaxId}`,
    );
    const greedy = await generateStoryteller(model, c.ids, {
      maxTokens: 4,
      temperature: 1,
      greedy: true,
      rng: mulberry32(0),
    });
    const tail = Array.from(greedy.ids).slice(c.ids.length);
    check(
      `forward: greedy 4-token ids (${JSON.stringify(c.prompt)})`,
      tail.length === c.greedyIds.length &&
        tail.every((v, i) => v === c.greedyIds[i]),
      `[${tail.join(",")}] vs [${c.greedyIds.join(",")}]`,
    );
  }

  // ---- 6. param count ----
  check(
    "params: formula == 6,917,376",
    storytellerParamCount(STORYTELLER_CONFIG) === EXPECTED_PARAMS,
  );
  check(
    "params: container == 6,917,376",
    decoded.paramCount === EXPECTED_PARAMS,
  );

  // ---- 7. shipped-artifact generation regression ----
  let expectations: {
    artifacts: Record<
      string,
      {
        crc32: number;
        cases: {
          seed: number;
          prompt: string;
          promptIdsUsed: number[];
          maxTokens: number;
          temperature: number;
          topK: number;
          ids: number[];
        }[];
      }
    >;
  } | null = null;
  try {
    expectations = JSON.parse(readFileSync(EXPECTATIONS_PATH, "utf8"));
  } catch {
    /* absent → skip (the chess convention) */
  }
  if (!expectations) {
    check(
      "regression: expectations recorded",
      false,
      "storyteller.bin is present but training/storyteller/fixtures/storyteller_expectations.json is missing — run training/storyteller/record_expectations.ts",
    );
  } else {
    const recorded = expectations.artifacts["storyteller.bin"];
    if (!recorded) {
      check(
        "regression: artifact recorded",
        false,
        "storyteller.bin present but missing from expectations",
      );
    } else {
      check("regression: crc32", crc32(bin) === recorded.crc32);
      for (const c of recorded.cases) {
        const fresh = createStorytellerModel(decodeStoryteller(bin));
        const res = await generateStoryteller(fresh, c.promptIdsUsed, {
          maxTokens: c.maxTokens,
          temperature: c.temperature,
          topK: c.topK,
          rng: mulberry32(c.seed),
        });
        const got = Array.from(res.ids);
        const ok =
          got.length === c.ids.length && got.every((v, i) => v === c.ids[i]);
        check(
          `regression: seed ${c.seed} ${JSON.stringify(c.prompt)} (${c.maxTokens} tok, T=${c.temperature})`,
          ok,
          ok ? "" : "generated ids differ from the recorded expectations",
        );
      }
    }
  }

  // ---- 8. trainingData drift guard ----
  const log = JSON.parse(readFileSync(LOG_PATH, "utf8"));
  const lossOk =
    LOSS_POINTS.length === log.evals.length &&
    LOSS_POINTS.every(
      (p, i) =>
        p.step === log.evals[i].step && p.valLoss === log.evals[i].valLoss,
    );
  const samplesOk =
    EVOLUTION_SAMPLES.length === log.samples.length &&
    EVOLUTION_SAMPLES.every(
      (s, i) =>
        s.step === log.samples[i].step && s.text === log.samples[i].text,
    );
  check("trainingData: 41 loss points match the log", lossOk);
  check("trainingData: 16 evolution samples match the log", samplesOk);

  console.log(
    failures === 0
      ? `verify:storyteller-model passed (${checks} checks)`
      : `verify:storyteller-model FAILED with ${failures} failure(s) of ${checks} checks`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
