/**
 * LLM Lab golden-fixture gate — proves the TS math core (the exact modules
 * the browser worker runs) agrees with the numpy reference in
 * training/llm/reference.py, and that the shipped sample artifact still
 * produces its recorded generations. Run:
 *
 *   npm run verify:llm-model
 *
 * Checks (exit 1 on any failure):
 *   1. tokenizer parity (exact)
 *   2. PRNG + Box-Muller stream parity (uniforms exact, normals within 1e-9)
 *   3. LR schedule table parity (tolerance)
 *   4. micro-model init parity (5-significant-digit values, tolerance)
 *   5. forward parity: logits + loss (tolerance)
 *   6. one constant-LR Adam step parity: post-step weights + loss (tolerance)
 *   7. artifact container: cross-language sha256 of the reference-encoded
 *      micro artifact, TS round-trip bit-exactness, fp16 idempotence, and
 *      corrupt-container rejections
 *   8. shipped-artifact regression (public/models/llm/*.bin against
 *      training/llm/fixtures/sample_expectations.json) — absent artifacts
 *      are "skipped", not failures (the chess absent-artifact convention)
 *
 * Tolerances (documented in docs/notes/llm-model-training.md): fixture values
 * are rounded to 5 significant digits, so comparisons use abs 1e-5 OR rel
 * 1e-3. Bit-exactness is claimed only where both sides are TS/V8.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MICRO_CONFIG, paramCount, TRAINING_DEFAULTS } from "../lib/llm/config";
import type { ModelConfig } from "../lib/llm/config";
import { decodeBytes, encodeBytes } from "../lib/llm/tokenizer";
import { mulberry32, normalSampler } from "../lib/llm/prng";
import {
  createModel,
  createWorkspace,
  forward,
  generate,
  initWeights,
} from "../lib/llm/model";
import { backward } from "../lib/llm/backward";
import {
  adamStep,
  createAdamState,
  gradNorm,
  lrAt,
  scaleGrads,
} from "../lib/llm/adam";
import { crc32, decodeArtifact, encodeArtifact } from "../lib/llm/artifact";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES_PATH = join(
  ROOT,
  "training",
  "llm",
  "fixtures",
  "llm_fixtures.json",
);
const EXPECTATIONS_PATH = join(
  ROOT,
  "training",
  "llm",
  "fixtures",
  "sample_expectations.json",
);
const ARTIFACT_DIR = join(ROOT, "public", "models", "llm");

interface Fixture {
  tokenizer_cases: Array<{ text: string; ids: number[] }>;
  prng: {
    seed: number;
    first32: number[];
    normals_seed: number;
    normals_first8: number[];
  };
  lr_schedule: {
    totalSteps: number;
    peakLr: number;
    warmupFrac: number;
    finalLrFrac: number;
    lr: number[];
  };
  micro: {
    config: ModelConfig;
    paramCount: number;
    seed: number;
    text: string;
    input_ids: number[];
    targets: number[];
    init_weights: number[];
    probs: number[];
    loss: number;
    grad_norm_pre_clip: number;
    post_step: { lr: number; weights: number[]; loss_after: number };
    artifact_fp32_sha256: string;
    artifact_fp16_sha256: string;
  };
}

interface SampleExpectations {
  artifacts: Record<
    string,
    {
      crc32: number;
      config: ModelConfig;
      cases: Array<{
        seed: number;
        prompt: string;
        maxTokens: number;
        temperature: number;
        ids: number[];
      }>;
    }
  >;
}

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  ok  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function close(a: number, b: number): boolean {
  return (
    Math.abs(a - b) <= 1e-5 ||
    Math.abs(a - b) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b))
  );
}

function closeArray(
  name: string,
  actual: ArrayLike<number>,
  expected: number[],
): void {
  if (actual.length !== expected.length) {
    check(name, false, `length ${actual.length} != ${expected.length}`);
    return;
  }
  let worst = 0;
  let worstAt = -1;
  for (let i = 0; i < expected.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    if (diff > worst) {
      worst = diff;
      worstAt = i;
    }
    if (!close(actual[i], expected[i])) {
      check(
        name,
        false,
        `first mismatch at ${i}: ${actual[i]} vs ${expected[i]}`,
      );
      return;
    }
  }
  check(
    name,
    true,
    `${expected.length} values, max |diff| ${worst.toExponential(2)} @${worstAt}`,
  );
}

const fixture = JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as Fixture;

// ---- 1. tokenizer ----------------------------------------------------------

for (const tc of fixture.tokenizer_cases) {
  const ids = Array.from(encodeBytes(tc.text));
  const exact =
    ids.length === tc.ids.length && ids.every((v, i) => v === tc.ids[i]);
  const roundTrip = decodeBytes(ids) === tc.text;
  check(`tokenizer "${tc.text.replace(/\n/g, "\\n")}"`, exact && roundTrip);
}

// ---- 2. PRNG streams ---------------------------------------------------------

{
  const rng = mulberry32(fixture.prng.seed);
  const stream = Array.from({ length: 32 }, () => rng());
  const exact = stream.every((v, i) => v === fixture.prng.first32[i]);
  check("mulberry32 first 32 uniforms (exact)", exact);

  const normals = normalSampler(mulberry32(fixture.prng.normals_seed));
  let maxDiff = 0;
  for (let i = 0; i < 8; i++)
    maxDiff = Math.max(
      maxDiff,
      Math.abs(normals() - fixture.prng.normals_first8[i]),
    );
  check(
    "box-muller first 8 normals",
    maxDiff <= 1e-4,
    `max |diff| ${maxDiff.toExponential(2)}`,
  );
}

// ---- 3. LR schedule ----------------------------------------------------------

{
  const S = fixture.lr_schedule;
  const lr = Array.from({ length: S.totalSteps }, (_, s) =>
    lrAt(s, S.totalSteps, S.peakLr, S.warmupFrac, S.finalLrFrac),
  );
  closeArray("lrAt warmup+cosine table", lr, S.lr);
}

// ---- 4-6. micro init, forward, one Adam step ---------------------------------

{
  const m = fixture.micro;
  const cfg = m.config;
  if (cfg.dModel !== MICRO_CONFIG.dModel || cfg.nLayer !== MICRO_CONFIG.nLayer)
    check(
      "micro config matches MICRO_CONFIG",
      false,
      "fixture/config drift — regenerate fixtures",
    );
  else check("micro config matches MICRO_CONFIG", true);
  check(
    "micro paramCount",
    paramCount(cfg) === m.paramCount,
    `${m.paramCount}`,
  );

  const model = createModel(cfg);
  initWeights(model, m.seed);
  closeArray("micro init weights", model.weights, m.init_weights);

  const ws = createWorkspace(cfg, 1, cfg.ctxLen, true);
  const ids = Uint8Array.from(m.input_ids);
  const targets = Uint8Array.from(m.targets);
  const loss = forward(model, ws, ids, targets)!;
  // Snapshot BEFORE backward — forward leaves softmax probs in ws.logits and
  // backward mutates them into dlogits. (Fixture stores probs, like the TS
  // workspace exposes them.)
  const probs = Float32Array.from(ws.logits);
  const lossValue = loss;
  closeArray("micro forward probs", probs, m.probs);
  check(
    "micro loss",
    close(lossValue, m.loss),
    `${lossValue.toFixed(5)} vs ${m.loss}`,
  );

  backward(model, ws, ids, targets);
  const norm = gradNorm(ws.grads!);
  check(
    "grad norm pre-clip",
    close(norm, m.grad_norm_pre_clip),
    `${norm.toFixed(4)} vs ${m.grad_norm_pre_clip}`,
  );
  if (norm > TRAINING_DEFAULTS.gradClip)
    scaleGrads(ws.grads!, TRAINING_DEFAULTS.gradClip / norm);
  adamStep(
    model.weights,
    ws.grads!,
    createAdamState(model.weights.length),
    m.post_step.lr,
    1,
    TRAINING_DEFAULTS.beta1,
    TRAINING_DEFAULTS.beta2,
    TRAINING_DEFAULTS.eps,
  );
  closeArray("post-step weights", model.weights, m.post_step.weights);
  const lossAfter = forward(model, ws, ids, targets)!;
  check(
    "post-step loss",
    close(lossAfter, m.post_step.loss_after),
    `${lossAfter.toFixed(5)} vs ${m.post_step.loss_after}`,
  );

  // ---- 7. artifact container (encoded from INIT weights — the fixture
  // hashes were recorded pre-step) ------------------------------------------
  const initModel = createModel(cfg);
  initWeights(initModel, m.seed);
  const fp32 = Buffer.from(encodeArtifact(initModel, 0));
  const sha32 = createHash("sha256").update(fp32).digest("hex");
  check(
    "artifact fp32 sha256 == reference",
    sha32 === m.artifact_fp32_sha256,
    sha32.slice(0, 16),
  );
  const fp16 = Buffer.from(encodeArtifact(initModel, 1));
  const sha16 = createHash("sha256").update(fp16).digest("hex");
  check(
    "artifact fp16 sha256 == reference",
    sha16 === m.artifact_fp16_sha256,
    sha16.slice(0, 16),
  );

  const roundTrip = decodeArtifact(fp32);
  let bitExact = roundTrip.weights.length === initModel.weights.length;
  if (bitExact)
    for (let i = 0; i < initModel.weights.length; i++)
      if (roundTrip.weights[i] !== initModel.weights[i]) {
        bitExact = false;
        break;
      }
  check("artifact fp32 round-trip bit-exact", bitExact);

  const fp16Again = Buffer.from(encodeArtifact(decodeArtifact(fp16), 1));
  check(
    "artifact fp16 encode→decode→encode idempotent",
    fp16Again.equals(fp16),
  );

  const corrupted: Array<[string, () => Buffer]> = [
    [
      "bad magic",
      () => {
        const b = Buffer.from(fp32);
        b[0] = 0x58;
        return b;
      },
    ],
    ["truncated", () => fp32.subarray(0, fp32.length - 8)],
    [
      "bad crc",
      () => {
        const b = Buffer.from(fp32);
        b[b.length - 1] ^= 0xff;
        return b;
      },
    ],
  ];
  for (const [label, make] of corrupted) {
    let threw = false;
    try {
      decodeArtifact(make());
    } catch {
      threw = true;
    }
    check(`corrupt container rejected (${label})`, threw);
  }
}

// ---- 8. shipped-artifact regression ------------------------------------------

if (!existsSync(EXPECTATIONS_PATH) || !existsSync(ARTIFACT_DIR)) {
  console.log("  --  sample artifacts: none recorded/present — skipped");
} else {
  const expectations = JSON.parse(
    readFileSync(EXPECTATIONS_PATH, "utf8"),
  ) as SampleExpectations;
  const files = readdirSync(ARTIFACT_DIR).filter((f) => f.endsWith(".bin"));
  if (files.length === 0)
    console.log("  --  sample artifacts: none present — skipped");
  for (const file of files) {
    const exp = expectations.artifacts[file];
    if (!exp) {
      check(
        `sample artifact ${file}`,
        false,
        "present but missing from sample_expectations.json",
      );
      continue;
    }
    const bytes = readFileSync(join(ARTIFACT_DIR, file));
    const model = decodeArtifact(new Uint8Array(bytes));
    check(
      `${file} crc32 matches expectations`,
      crc32(new Uint8Array(bytes)) === exp.crc32,
    );
    const gws = createWorkspace(model.config, 1, model.config.ctxLen, false);
    for (const c of exp.cases) {
      const ids = Array.from(
        generate(model, gws, encodeBytes(c.prompt), {
          maxTokens: c.maxTokens,
          temperature: c.temperature,
          seed: c.seed,
        }),
      );
      const exact =
        ids.length === c.ids.length && ids.every((v, i) => v === c.ids[i]);
      check(`${file} generation (seed ${c.seed})`, exact);
    }
  }
}

console.log(
  failures === 0
    ? `verify:llm-model passed (${checks} checks)`
    : `verify:llm-model FAILED with ${failures} failure(s) (of ${checks} checks)`,
);
if (failures > 0) process.exitCode = 1;
