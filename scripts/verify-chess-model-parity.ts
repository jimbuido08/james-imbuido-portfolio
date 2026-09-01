/**
 * Cross-language parity gate for the chess models (run: npm run verify:chess-model).
 *
 * 1. Encoding parity — every golden FEN encodes (TypeScript) to the exact
 *    `planes_sha256` the Python trainer recorded in
 *    training/fixtures/golden_positions.json, and every fixture move triple
 *    maps to the same policy index on both sides.
 * 2. Artifact expectations — every shipped public/models/chess-<band>.onnx
 *    reproduces the top-1 legal move recorded per golden FEN in
 *    training/fixtures/model_expectations.json (masked argmax via the ORT-web
 *    wasm backend, the same runtime the browser uses).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { Chess } from "chess.js";
import * as ort from "onnxruntime-web/wasm";

import {
  POLICY_LOGITS,
  encodePosition,
  isBlackToMove,
  planesDigest,
  policyIndex,
  squareIndex,
} from "../lib/chess/modelEncoding";
import type { Difficulty, MoveSnapshot } from "../types/chess";

ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

interface GoldenMove {
  uci: string;
  from_idx: number;
  to_idx: number;
}

interface GoldenFixture {
  fen: string;
  planes_sha256: string;
  moves: GoldenMove[];
}

interface Expectations {
  [difficulty: string]: { [fen: string]: string };
}

const REPO = resolve(import.meta.dirname, "..");
const FIXTURES = resolve(REPO, "training/fixtures");
const MODELS_DIR = resolve(REPO, "public/models");
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

let failures = 0;

function check(ok: boolean, message: string): void {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

/** Legal moves via chess.js, deduped to one move per (from, to) with the
 *  queen promotion preferred — exactly pickBest's policy mask. */
function policyMask(fen: string): Array<{ move: MoveSnapshot; idx: number }> {
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true }) as MoveSnapshot[];
  const mirror = isBlackToMove(fen);
  const byPair = new Map<string, { move: MoveSnapshot; idx: number }>();
  for (const move of legal) {
    const pairKey = `${move.from}${move.to}`;
    const existing = byPair.get(pairKey);
    if (
      !existing ||
      (move.promotion === "q" && existing.move.promotion !== "q")
    ) {
      byPair.set(pairKey, {
        move,
        idx: policyIndex(
          squareIndex(move.from, mirror),
          squareIndex(move.to, mirror),
        ),
      });
    }
  }
  return Array.from(byPair.values());
}

async function main(): Promise<void> {
  const fixtures: GoldenFixture[] = JSON.parse(
    readFileSync(resolve(FIXTURES, "golden_positions.json"), "utf-8"),
  );

  // ---- 1. Encoding parity ------------------------------------------------
  console.log(`Encoding parity: ${fixtures.length} golden FENs`);
  for (const fixture of fixtures) {
    const digest = await planesDigest(encodePosition(fixture.fen));
    check(
      digest === fixture.planes_sha256,
      `planes sha256 mismatch for "${fixture.fen}" (ts=${digest.slice(0, 12)} py=${fixture.planes_sha256.slice(0, 12)})`,
    );
    const mirror = isBlackToMove(fixture.fen);
    for (const move of fixture.moves) {
      const idx = policyIndex(
        squareIndex(move.uci.slice(0, 2), mirror),
        squareIndex(move.uci.slice(2, 4), mirror),
      );
      check(
        idx === move.from_idx * 64 + move.to_idx,
        `policy index mismatch for ${move.uci} in "${fixture.fen}"`,
      );
    }
  }
  if (failures === 0)
    console.log("  all planes digests + policy indices match");

  // ---- 2. Artifact expectations -------------------------------------------
  const expectationsPath = resolve(FIXTURES, "model_expectations.json");
  const expectations: Expectations = existsSync(expectationsPath)
    ? JSON.parse(readFileSync(expectationsPath, "utf-8"))
    : {};

  for (const difficulty of DIFFICULTIES) {
    const modelPath = resolve(MODELS_DIR, `chess-${difficulty}.onnx`);
    if (!existsSync(modelPath)) {
      console.log(
        `chess-${difficulty}.onnx: absent (heuristic fallback) — skipped`,
      );
      continue;
    }
    const session = await ort.InferenceSession.create(
      new Uint8Array(readFileSync(modelPath)),
      { executionProviders: ["wasm"] },
    );
    let checked = 0;
    let matched = 0;
    for (const fixture of fixtures) {
      const results = await session.run({
        board: new ort.Tensor(
          "float32",
          encodePosition(fixture.fen),
          [1, 17, 8, 8],
        ),
      });
      const logits = results.policy.data as Float32Array;
      check(logits.length === POLICY_LOGITS, "policy output shape");
      const mask = policyMask(fixture.fen);
      check(mask.length > 0, `no legal moves for "${fixture.fen}"`);
      let bestIdx = -1;
      let bestMove: string | null = null;
      for (const { move, idx } of mask) {
        if (bestMove === null || logits[idx] > logits[bestIdx]) {
          // Expectations are recorded as from+to only (queen-promotion-blind,
          // matching the policy index space).
          bestMove = `${move.from}${move.to}`;
          bestIdx = idx;
        }
      }
      const expected = expectations[difficulty]?.[fixture.fen];
      if (expected) {
        checked += 1;
        if (bestMove === expected) matched += 1;
        else {
          failures += 1;
          console.error(
            `  FAIL chess-${difficulty} on "${fixture.fen}": got ${bestMove}, expected ${expected}`,
          );
        }
      }
    }
    console.log(
      `chess-${difficulty}.onnx: ${matched}/${checked} expectation matches` +
        (checked === 0 ? " (no expectations recorded)" : ""),
    );
    if (checked > 0 && matched < checked) process.exitCode = 1;
  }

  if (failures > 0) {
    console.error(`\nverify:chess-model FAILED with ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nverify:chess-model passed");
}

void main();
