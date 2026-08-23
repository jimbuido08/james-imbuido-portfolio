/** Isomorphic chess rules wrapper (no React/DOM imports) — Phase 7 reuses this server-side to replay submitted games. */
import { Chess } from "chess.js";
import type { Move } from "chess.js";

import type {
  EngineStatus,
  MoveSnapshot,
  PromotionChoice,
  Side,
  SquareName,
  SquareState,
} from "@/types/chess";

export interface ChessGameEngine {
  /** Current position as FEN. */
  fen(): string;
  /** Side to move. */
  turn(): Side;
  /** All 64 squares in chess.js board order (rank 8 first, files a→h). */
  squares(): SquareState[];
  /** Verbose legal moves, optionally restricted to an origin square. */
  legalMoves(square?: SquareName): MoveSnapshot[];
  /**
   * Validate and apply a move. Never throws on illegality:
   * returns { ok: false } instead. Resolves promotion from `promotion` (default "q"
   * is NOT allowed here — the caller must pass `promotion` for promotion moves).
   */
  tryMove(
    from: SquareName,
    to: SquareName,
    promotion?: PromotionChoice,
  ): { ok: true; move: MoveSnapshot } | { ok: false };
  /** Engine status of the current position (playing+check, or terminal). */
  status(): EngineStatus;
  /** Verbose move history since the last reset/load. */
  history(): MoveSnapshot[];
  /** Reset to the standard initial position. */
  reset(): void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function toSnapshot(move: Move): MoveSnapshot {
  return {
    from: move.from as SquareName,
    to: move.to as SquareName,
    san: move.san,
    color: move.color,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
  };
}

export function createEngine(fen?: string): ChessGameEngine {
  const game = new Chess(fen);

  return {
    fen: () => game.fen(),
    turn: () => game.turn(),
    squares: () => {
      // chess.js board(): rank 8 first, files a→h; null cells carry no square
      // name, so derive every name from the row/column index.
      const result: SquareState[] = [];
      game.board().forEach((row, r) =>
        row.forEach((cell, f) => {
          result.push({
            square: `${FILES[f]}${8 - r}` as SquareName,
            piece: cell ? { type: cell.type, color: cell.color } : null,
          });
        }),
      );
      return result;
    },
    legalMoves: (square) =>
      game
        .moves(square ? { square, verbose: true } : { verbose: true })
        .map(toSnapshot),
    tryMove: (from, to, promotion) => {
      // Promotion moves must name the piece — never silently default to queen.
      if (
        !promotion &&
        game
          .moves({ square: from, verbose: true })
          .some((m) => m.to === to && m.promotion)
      ) {
        return { ok: false };
      }
      let applied: Move | null = null;
      try {
        applied = game.move({ from, to, ...(promotion ? { promotion } : {}) });
      } catch {
        return { ok: false };
      }
      if (!applied) return { ok: false };
      return { ok: true, move: toSnapshot(applied) };
    },
    status: () => {
      if (game.isCheckmate()) {
        return {
          kind: "over",
          winner: game.turn() === "w" ? "b" : "w",
          reason: "checkmate",
        };
      }
      if (game.isStalemate()) {
        return { kind: "over", winner: null, reason: "stalemate" };
      }
      if (game.isThreefoldRepetition()) {
        return { kind: "over", winner: null, reason: "threefold" };
      }
      if (game.isInsufficientMaterial()) {
        return { kind: "over", winner: null, reason: "insufficient" };
      }
      if (game.isDrawByFiftyMoves()) {
        return { kind: "over", winner: null, reason: "fifty-move" };
      }
      return { kind: "playing", check: game.isCheck() };
    },
    history: () => game.history({ verbose: true }).map(toSnapshot),
    reset: () => game.reset(),
  };
}

/**
 * Phase 7 seam (built now so the server route can `import` it unchanged):
 * re-apply a submitted move list from the initial position (or `fen`) and
 * report whether every move was legal.
 */
export function replayMoves(
  moves: ReadonlyArray<{
    from: SquareName;
    to: SquareName;
    promotion?: PromotionChoice;
  }>,
  fen?: string,
): { ok: true; engine: ChessGameEngine } | { ok: false; atIndex: number } {
  const engine = createEngine(fen);
  for (let i = 0; i < moves.length; i++) {
    const { from, to, promotion } = moves[i];
    if (!engine.tryMove(from, to, promotion).ok) {
      return { ok: false, atIndex: i };
    }
  }
  return { ok: true, engine };
}
