/** Isomorphic opponent module (no React/DOM imports). Honest stand-ins until the trained model ships — see TODO(MODEL) below. */
import { Chess } from "chess.js";

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

export function createOpponent(difficulty: Difficulty): ChessOpponent {
  switch (difficulty) {
    case "easy":
      return easyOpponent;
    case "medium":
      return mediumOpponent;
    case "hard":
      return hardOpponent;
  }
}

// TODO(MODEL): implement OnnxOpponent against this interface once public/models/
// holds real weights (lazy import("onnxruntime-web") + fetch("/models/…")).
