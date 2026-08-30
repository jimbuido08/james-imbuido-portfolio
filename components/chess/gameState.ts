/**
 * The chess game's state machine, extracted from ChessGame.tsx so the largest
 * client object is exercisable directly: every transition (selection, promotion
 * gating, resign arming, game-over recording) runs through `reducer` with an
 * injected engine — no React, no DOM. ChessGame.tsx owns only the event
 * handlers that dispatch into it.
 */
import { createEngine } from "@/lib/chess/engine";
import type { ChessGameEngine } from "@/lib/chess/engine";
import type {
  Difficulty,
  GameResult,
  MoveSnapshot,
  Side,
  SquareName,
} from "@/types/chess";

export interface GameUiState {
  engine: ChessGameEngine; // created via createEngine(), held by reference
  version: number; // bumps on every applied move / reset to re-render
  started: boolean; // setup screen (false) vs live game (true)
  playerColor: Side;
  nextPlayerColor: Side; // pending "Play as" preference for New game
  difficulty: Difficulty; // live
  selected: SquareName | null;
  focusSquare: SquareName; // roving tabindex owner
  pendingPromotion: { from: SquareName; to: SquareName } | null;
  lastMove: { from: SquareName; to: SquareName } | null;
  history: MoveSnapshot[]; // mirrors engine.history()
  thinking: boolean; // AI turn in flight
  resignArmed: boolean; // two-step resign
  result: GameResult | null;
}

export type GameAction =
  | { type: "selectSquare"; square: SquareName | null }
  | { type: "moveFocus"; square: SquareName }
  | { type: "applyMove"; move: MoveSnapshot }
  | {
      type: "setPendingPromotion";
      pending: { from: SquareName; to: SquareName } | null;
    }
  | { type: "armResign" }
  | { type: "disarmResign" }
  | { type: "resign" }
  | { type: "setDifficulty"; difficulty: Difficulty }
  | { type: "setNextPlayerColor"; side: Side }
  | { type: "startGame"; engine: ChessGameEngine }
  | { type: "toSetup" }
  | { type: "setThinking"; thinking: boolean };

/** Deterministic — no randomness here; it runs on the server during SSR. */
export function initialState(): GameUiState {
  return {
    engine: createEngine(),
    version: 0,
    started: false,
    playerColor: "w",
    nextPlayerColor: "w",
    difficulty: "medium",
    selected: null,
    focusSquare: "e1",
    pendingPromotion: null,
    lastMove: null,
    history: [],
    thinking: false,
    resignArmed: false,
    result: null,
  };
}

export function reducer(state: GameUiState, action: GameAction): GameUiState {
  switch (action.type) {
    case "selectSquare":
      return { ...state, selected: action.square };
    case "moveFocus":
      return { ...state, focusSquare: action.square };
    case "setPendingPromotion":
      return { ...state, pendingPromotion: action.pending };
    case "applyMove": {
      // The engine was already mutated by the event handler (immediately before
      // dispatch); the reducer only reads the fresh truth and records the render
      // signal.
      const status = state.engine.status();
      return {
        ...state,
        version: state.version + 1,
        selected: null,
        pendingPromotion: null,
        lastMove: { from: action.move.from, to: action.move.to },
        history: state.engine.history(),
        thinking: false,
        resignArmed: false,
        focusSquare: action.move.to,
        result:
          status.kind === "over"
            ? { winner: status.winner, reason: status.reason }
            : state.result,
      };
    }
    case "armResign":
      return { ...state, resignArmed: true };
    case "disarmResign":
      return { ...state, resignArmed: false };
    case "resign":
      return {
        ...state,
        result: {
          winner: state.playerColor === "w" ? "b" : "w",
          reason: "resignation",
        },
        thinking: false,
        resignArmed: false,
        selected: null,
      };
    case "setDifficulty":
      return { ...state, difficulty: action.difficulty };
    case "setNextPlayerColor":
      return { ...state, nextPlayerColor: action.side };
    case "setThinking":
      return { ...state, thinking: action.thinking };
    case "startGame": {
      const color = state.nextPlayerColor;
      return {
        ...initialState(),
        engine: action.engine,
        started: true,
        difficulty: state.difficulty,
        playerColor: color,
        nextPlayerColor: color,
        focusSquare: color === "w" ? "e1" : "e8",
        version: state.version + 1,
      };
    }
    case "toSetup":
      // Back to the configuration screen; the previous selections carry over.
      return {
        ...initialState(),
        difficulty: state.difficulty,
        nextPlayerColor: state.nextPlayerColor,
      };
  }
}

/** The one status sentence the UI shows, derived purely from state. */
export function computeStatusLine(state: GameUiState): string {
  const { engine, playerColor, result } = state;
  if (result) {
    switch (result.reason) {
      case "checkmate":
        return result.winner === playerColor
          ? "Checkmate — you win"
          : "Checkmate — the AI wins";
      case "stalemate":
        return "Stalemate — draw";
      case "threefold":
        return "Draw — threefold repetition";
      case "insufficient":
        return "Draw — insufficient material";
      case "fifty-move":
        return "Draw — fifty-move rule";
      case "resignation":
        return "You resigned — the AI wins";
    }
  }
  if (engine.turn() !== playerColor) return "Opponent is thinking…";
  const status = engine.status();
  if (status.kind === "playing" && status.check) return "Check — your move";
  return "Your move";
}
