/** Isomorphic opponent module (no React/DOM imports).
 *
 *  Three trained ONNX policy networks — one per difficulty band — pick among
 *  the legal moves they are handed (§3.6 separation: the rules engine owns
 *  legality, the model only ranks legal moves). Loading is lazy per
 *  difficulty; any failure falls back to the heuristic opponents below, so a
 *  missing/broken artifact degrades to the pre-model behaviour instead of
 *  breaking the game.
 */
import { Chess } from "chess.js";

import {
  INPUT_FLOATS,
  POLICY_LOGITS,
  encodePosition,
  isBlackToMove,
  policyIndex,
  squareIndex,
} from "@/lib/chess/modelEncoding";
import type { Difficulty, MoveSnapshot, PieceType } from "@/types/chess";

export interface OpponentInput {
  fen: string;
  /** Verbose legal moves in the position — the only moves an opponent may return. */
  legal: MoveSnapshot[];
}

/** A chess opponent that picks among legal moves it is given (§3.6 separation). */
export interface ChessOpponent {
  readonly difficulty: Difficulty;
  selectMove(input: OpponentInput): Promise<MoveSnapshot>;
}

const THINK_MS = 250;

function think(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, THINK_MS));
}

const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const CENTRAL_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function requireLegal(input: OpponentInput): void {
  if (input.legal.length === 0) {
    throw new Error("selectMove called with no legal moves");
  }
}

function playOnClone(input: OpponentInput, move: MoveSnapshot): Chess {
  const clone = new Chess(input.fen);
  clone.move({
    from: move.from,
    to: move.to,
    ...(move.promotion
      ? { promotion: move.promotion as "q" | "r" | "b" | "n" }
      : {}),
  });
  return clone;
}

/** Material + tiny centrality term, from White's perspective. */
function evaluate(game: Chess): number {
  let score = 0;
  for (const row of game.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const centrality =
        CENTRAL_SQUARES.has(cell.square) &&
        (cell.type === "p" || cell.type === "n")
          ? 0.05
          : 0;
      const value = PIECE_VALUE[cell.type] + centrality;
      score += cell.color === "w" ? value : -value;
    }
  }
  return score;
}

/** Negamax with alpha-beta; score is relative to the side to move. */
function search(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (game.isCheckmate()) return -10000 - depth; // sooner mates score worse
  if (game.isDraw()) return 0;
  if (depth === 0) return evaluate(game) * (game.turn() === "w" ? 1 : -1);

  let best = -Infinity;
  for (const move of game.moves({ verbose: true })) {
    game.move(move);
    const score = -search(game, depth - 1, -beta, -alpha);
    game.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function bestScored(
  input: OpponentInput,
  score: (move: MoveSnapshot) => number,
): MoveSnapshot {
  let bestScore = -Infinity;
  let bestMoves: MoveSnapshot[] = [];
  for (const move of input.legal) {
    const s = score(move);
    if (s > bestScore) {
      bestScore = s;
      bestMoves = [move];
    } else if (s === bestScore) {
      bestMoves.push(move);
    }
  }
  return randomOf(bestMoves);
}

const easyOpponent: ChessOpponent = {
  difficulty: "easy",
  async selectMove(input) {
    requireLegal(input);
    await think();
    return randomOf(input.legal);
  },
};

const mediumOpponent: ChessOpponent = {
  difficulty: "medium",
  async selectMove(input) {
    requireLegal(input);
    await think();
    return bestScored(input, (move) => {
      const after = playOnClone(input, move);
      return (
        (move.captured ? PIECE_VALUE[move.captured] : 0) * 10 -
        PIECE_VALUE[move.piece] * 0.25 +
        (after.isCheck() ? 1.5 : 0)
      );
    });
  },
};

const hardOpponent: ChessOpponent = {
  difficulty: "hard",
  async selectMove(input) {
    requireLegal(input);
    await think();
    const root = new Chess(input.fen);
    return bestScored(input, (move) => {
      root.move({
        from: move.from,
        to: move.to,
        ...(move.promotion
          ? { promotion: move.promotion as "q" | "r" | "b" | "n" }
          : {}),
      });
      const score = -search(root, 1, -Infinity, Infinity);
      root.undo();
      return score;
    });
  },
};

// ---- Model opponents -------------------------------------------------------
// TODO(MODEL) satisfied: OnnxOpponent loads /models/chess-<band>.onnx lazily.

type OrtModule = typeof import("onnxruntime-web/wasm");
type InferenceSession = Awaited<
  ReturnType<OrtModule["InferenceSession"]["create"]>
>;

export type ModelState = "unloaded" | "loading" | "ready" | "failed";

interface SessionBundle {
  session: InferenceSession;
  ort: OrtModule;
}

const MODEL_FETCH_TIMEOUT_MS = 20_000;

function modelUrl(difficulty: Difficulty): string {
  return `/models/chess-${difficulty}.onnx`;
}

const modelStates: Record<Difficulty, ModelState> = {
  easy: "unloaded",
  medium: "unloaded",
  hard: "unloaded",
};

/** One in-flight (or settled) session promise per difficulty. Needed because
 *  createOpponent() is called fresh on every AI turn — the cache is what makes
 *  the model load once per page, not once per move. */
const sessionPromises = new Map<Difficulty, Promise<SessionBundle>>();

export function getModelState(difficulty: Difficulty): ModelState {
  return modelStates[difficulty];
}

function markState(difficulty: Difficulty, state: ModelState): void {
  modelStates[difficulty] = state;
}

function loadSession(difficulty: Difficulty): Promise<SessionBundle> {
  const existing = sessionPromises.get(difficulty);
  if (existing) return existing;

  const promise = (async () => {
    markState(difficulty, "loading");
    try {
      // Lazy, so onnxruntime-web and its wasm never enter the main bundle.
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = "/models/ort/";
      // Single-threaded wasm: the COOP/COEP headers a worker/threads setup
      // would require are not worth it for a ~350k-param CNN.
      ort.env.wasm.numThreads = 1;
      const response = await fetch(modelUrl(difficulty), {
        signal: AbortSignal.timeout(MODEL_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`model fetch failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const session = await ort.InferenceSession.create(
        new Uint8Array(buffer),
        { executionProviders: ["wasm"] },
      );
      markState(difficulty, "ready");
      return { session, ort };
    } catch (err) {
      markState(difficulty, "failed");
      sessionPromises.delete(difficulty);
      throw err;
    }
  })();
  sessionPromises.set(difficulty, promise);
  return promise;
}

/** Prefetch a difficulty's model (called when the user picks a difficulty in
 *  the setup screen). Never rejects — failures just mark the state. */
export function warmupOpponent(difficulty: Difficulty): void {
  void loadSession(difficulty).catch(() => {
    // fall back to heuristics; nothing else to do here
  });
}

/** Argmax over the model's policy restricted to legal moves. Deterministic:
 *  ties keep the first (board-order) move, and the same position always gets
 *  the same reply. */
function pickBest(logits: Float32Array, input: OpponentInput): MoveSnapshot {
  const mirror = isBlackToMove(input.fen);
  // Promotion dedup: every (from, to) promotion variant shares one policy
  // index — score the pair once, and keep the queen variant so the move we
  // return promotes to a queen (the policy's documented assumption).
  const byPair = new Map<string, MoveSnapshot>();
  for (const move of input.legal) {
    const pairKey = `${move.from}${move.to}`;
    const existing = byPair.get(pairKey);
    if (!existing || (move.promotion === "q" && existing.promotion !== "q")) {
      byPair.set(pairKey, move);
    }
  }

  let best: MoveSnapshot | null = null;
  let bestIdx = -1;
  for (const move of byPair.values()) {
    const key = policyIndex(
      squareIndex(move.from, mirror),
      squareIndex(move.to, mirror),
    );
    if (!best || logits[key] > logits[bestIdx]) {
      best = move;
      bestIdx = key;
    }
  }
  if (!best) {
    // Unreachable: input.legal is non-empty, so at least one index exists.
    throw new Error("pickBest found no scored move");
  }
  return best;
}

async function modelSelectMove(
  bundle: SessionBundle,
  input: OpponentInput,
): Promise<MoveSnapshot> {
  const data = encodePosition(input.fen, new Float32Array(INPUT_FLOATS));
  const results = await bundle.session.run({
    board: new bundle.ort.Tensor("float32", data, [1, 17, 8, 8]),
  });
  const policy = results.policy;
  if (!policy || policy.data.length !== POLICY_LOGITS) {
    throw new Error(
      `unexpected policy output: ${policy?.data.length ?? "null"} logits`,
    );
  }
  return pickBest(policy.data as Float32Array, input);
}

function createOnnxOpponent(difficulty: Difficulty): ChessOpponent {
  return {
    difficulty,
    async selectMove(input) {
      // The one throw this module ever produces: an empty legal list is a
      // caller bug, not a fallback situation.
      requireLegal(input);
      await think();
      try {
        const bundle = await loadSession(difficulty);
        return await modelSelectMove(bundle, input);
      } catch (err) {
        console.warn(
          `Model opponent (${difficulty}) unavailable; falling back to heuristic.`,
          err,
        );
        markState(difficulty, "failed");
        sessionPromises.delete(difficulty);
        return heuristicSelectMove(difficulty, input);
      }
    },
  };
}

/** The heuristic opponents, exposed both as the fallback path and for tests. */
export function createHeuristicOpponent(difficulty: Difficulty): ChessOpponent {
  switch (difficulty) {
    case "easy":
      return easyOpponent;
    case "medium":
      return mediumOpponent;
    case "hard":
      return hardOpponent;
  }
}

function heuristicSelectMove(
  difficulty: Difficulty,
  input: OpponentInput,
): Promise<MoveSnapshot> {
  return createHeuristicOpponent(difficulty).selectMove(input);
}

export function createOpponent(difficulty: Difficulty): ChessOpponent {
  return createOnnxOpponent(difficulty);
}
