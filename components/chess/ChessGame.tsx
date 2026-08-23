"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { ChessBoard, GLYPHS } from "@/components/chess/ChessBoard";
import { GameControls } from "@/components/chess/GameControls";
import { GameStatus } from "@/components/chess/GameStatus";
import { MoveList } from "@/components/chess/MoveList";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { createEngine } from "@/lib/chess/engine";
import type { ChessGameEngine } from "@/lib/chess/engine";
import { createOpponent } from "@/lib/chess/opponents";
import type {
  Difficulty,
  GameResult,
  MoveSnapshot,
  PieceType,
  PromotionChoice,
  Side,
  SquareName,
} from "@/types/chess";

interface GameUiState {
  engine: ChessGameEngine; // created via createEngine(), held by reference
  version: number; // bumps on every applied move / reset to re-render
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

type GameAction =
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
  | { type: "newGame"; engine: ChessGameEngine }
  | { type: "setThinking"; thinking: boolean };

/** Deterministic — no randomness here; it runs on the server during SSR. */
function initialState(): GameUiState {
  return {
    engine: createEngine(),
    version: 0,
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

function reducer(state: GameUiState, action: GameAction): GameUiState {
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
    case "newGame": {
      const color = state.nextPlayerColor;
      return {
        ...initialState(),
        engine: action.engine,
        difficulty: state.difficulty,
        playerColor: color,
        nextPlayerColor: color,
        focusSquare: color === "w" ? "e1" : "e8",
        version: state.version + 1,
      };
    }
  }
}

function computeStatusLine(state: GameUiState): string {
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

function neighborSquare(
  square: SquareName,
  key: string,
  orientation: Side,
): SquareName | null {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  // Arrow keys follow the screen, not the board: with Black at the bottom,
  // Up moves toward rank 1 and Right moves toward the a file.
  const sign = orientation === "w" ? 1 : -1;
  let f = file;
  let r = rank;
  if (key === "ArrowUp") r += sign;
  else if (key === "ArrowDown") r -= sign;
  else if (key === "ArrowRight") f += sign;
  else if (key === "ArrowLeft") f -= sign;
  else return null;
  if (f < 0 || f > 7 || r < 1 || r > 8) return null;
  return `${String.fromCharCode(97 + f)}${r}` as SquareName;
}

function focusSquareEl(square: SquareName): void {
  document
    .querySelector<HTMLButtonElement>(`[data-square="${square}"]`)
    ?.focus();
}

export function ChessGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { engine } = state;
  // Drag state: ref for the in-flight gesture, state only once it becomes a
  // visual drag (glyph follows the pointer).
  const dragRef = useRef<{
    from: SquareName;
    piece: PieceType;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{
    piece: PieceType;
    x: number;
    y: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const aiRunRef = useRef(0);
  const resignTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputOpen =
    !state.result &&
    !state.thinking &&
    !state.pendingPromotion &&
    engine.status().kind === "playing" &&
    engine.turn() === state.playerColor;

  // StrictMode-safe AI trigger: effects double-invoke in dev, so each run gets
  // a token plus a per-effect cancelled flag; stale resolutions are dropped.
  useEffect(() => {
    const status = engine.status();
    if (state.result || status.kind === "over") return;
    if (engine.turn() === state.playerColor) return;
    let cancelled = false;
    const run = ++aiRunRef.current;
    dispatch({ type: "setThinking", thinking: true });
    const opponent = createOpponent(state.difficulty);
    const fen = engine.fen();
    const legal = engine.legalMoves();
    void opponent
      .selectMove({ fen, legal })
      .then((choice) => {
        if (cancelled || run !== aiRunRef.current) return;
        let res = engine.tryMove(
          choice.from,
          choice.to,
          choice.promotion as PromotionChoice | undefined,
        );
        if (!res.ok) {
          // Impossible by construction (opponents pick from `legal`); fall back
          // to a random legal move instead of crashing the game.
          console.error(
            "Opponent produced an illegal move; falling back.",
            choice,
          );
          const fallback = legal[Math.floor(Math.random() * legal.length)];
          res = engine.tryMove(
            fallback.from,
            fallback.to,
            fallback.promotion as PromotionChoice | undefined,
          );
        }
        if (res.ok) dispatch({ type: "applyMove", move: res.move });
        else dispatch({ type: "setThinking", thinking: false });
      })
      .catch((err: unknown) => {
        console.error("Opponent failed to choose a move.", err);
        if (!cancelled && run === aiRunRef.current)
          dispatch({ type: "setThinking", thinking: false });
      });
    return () => {
      cancelled = true;
    };
  }, [
    engine,
    state.version,
    state.playerColor,
    state.difficulty,
    state.result,
  ]);

  function attemptMove(from: SquareName, to: SquareName): void {
    const targets = engine.legalMoves(from).filter((m) => m.to === to);
    if (targets.length === 0) return;
    if (targets.some((m) => m.promotion)) {
      dispatch({ type: "setPendingPromotion", pending: { from, to } });
      return;
    }
    const res = engine.tryMove(from, to);
    if (res.ok) dispatch({ type: "applyMove", move: res.move });
  }

  function handleActivate(square: SquareName): void {
    if (!inputOpen) return;
    const occupant = engine.squares().find((s) => s.square === square)?.piece;
    const ownPiece = occupant?.color === state.playerColor;
    if (state.selected === null) {
      if (ownPiece) dispatch({ type: "selectSquare", square });
      return;
    }
    if (square === state.selected) {
      dispatch({ type: "selectSquare", square: null });
      return;
    }
    if (ownPiece) {
      dispatch({ type: "selectSquare", square });
      return;
    }
    // Illegal target click clears the selection (touch-friendly default).
    if (!engine.legalMoves(state.selected).some((m) => m.to === square)) {
      dispatch({ type: "selectSquare", square: null });
      return;
    }
    attemptMove(state.selected, square);
  }

  function handleSquareClick(square: SquareName): void {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    handleActivate(square);
  }

  function handleKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    square: SquareName,
  ): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate(square);
      return;
    }
    if (e.key === "Escape") {
      dispatch({ type: "selectSquare", square: null });
      return;
    }
    const next = neighborSquare(square, e.key, state.playerColor);
    if (next) {
      e.preventDefault();
      dispatch({ type: "moveFocus", square: next });
      focusSquareEl(next);
    }
  }

  function handlePointerDown(
    e: PointerEvent<HTMLButtonElement>,
    square: SquareName,
  ): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!inputOpen) return;
    const piece = engine.squares().find((s) => s.square === square)?.piece;
    if (!piece || piece.color !== state.playerColor) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      from: square,
      piece: piece.type,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }

  function handlePointerMove(e: PointerEvent<HTMLButtonElement>): void {
    const d = dragRef.current;
    if (!d) return;
    if (
      !d.active &&
      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= 6
    )
      return;
    if (!d.active) {
      d.active = true;
      // Selecting the origin on drag-start reveals the legal targets mid-drag.
      dispatch({ type: "selectSquare", square: d.from });
    }
    setDrag({ piece: d.piece, x: e.clientX, y: e.clientY });
  }

  function handlePointerUp(e: PointerEvent<HTMLButtonElement>): void {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.active) return; // a tap — the click handler owns it
    didDragRef.current = true;
    setDrag(null);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const to = el?.closest("[data-square]")?.getAttribute("data-square");
    if (!to || to === d.from) return;
    attemptMove(d.from, to as SquareName);
  }

  function handlePromotionPick(choice: PromotionChoice): void {
    const pending = state.pendingPromotion;
    if (!pending) return;
    const res = engine.tryMove(pending.from, pending.to, choice);
    if (res.ok) dispatch({ type: "applyMove", move: res.move });
    else dispatch({ type: "setPendingPromotion", pending: null });
  }

  function handlePromotionCancel(): void {
    const origin = state.pendingPromotion?.from;
    dispatch({ type: "setPendingPromotion", pending: null });
    if (origin) {
      dispatch({ type: "moveFocus", square: origin });
      focusSquareEl(origin);
    }
  }

  function handleResign(): void {
    if (state.resignArmed) {
      if (resignTimerRef.current) clearTimeout(resignTimerRef.current);
      aiRunRef.current += 1; // cancel any in-flight AI turn
      dispatch({ type: "resign" });
      return;
    }
    dispatch({ type: "armResign" });
    resignTimerRef.current = setTimeout(
      () => dispatch({ type: "disarmResign" }),
      5000,
    );
  }

  function handleNewGame(): void {
    if (resignTimerRef.current) clearTimeout(resignTimerRef.current);
    aiRunRef.current += 1; // cancel any in-flight AI turn
    dragRef.current = null;
    setDrag(null);
    dispatch({ type: "newGame", engine: createEngine() });
  }

  const squares = engine.squares();
  const status = engine.status();
  const checkedSide =
    status.kind === "playing" && status.check ? engine.turn() : null;
  const checkSquare = checkedSide
    ? (squares.find(
        (s) => s.piece?.type === "k" && s.piece.color === checkedSide,
      )?.square ?? null)
    : null;
  const legalTargets =
    state.selected && inputOpen ? engine.legalMoves(state.selected) : [];
  const statusLine = computeStatusLine(state);

  return (
    <>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,36rem)_18rem]">
        <div>
          <GameStatus
            statusLine={statusLine}
            result={state.result}
            onNewGame={handleNewGame}
          />
          <div className="relative w-full max-w-[36rem]">
            <ChessBoard
              squares={squares}
              orientation={state.playerColor}
              selected={state.selected}
              legalTargets={legalTargets}
              lastMove={state.lastMove}
              checkSquare={checkSquare}
              focusSquare={state.focusSquare}
              dragging={drag !== null}
              onSquareClick={handleSquareClick}
              onSquareKeyDown={handleKeyDown}
              onSquareFocus={(square) =>
                dispatch({ type: "moveFocus", square })
              }
              onSquarePointerDown={handlePointerDown}
              onSquarePointerMove={handlePointerMove}
              onSquarePointerUp={handlePointerUp}
            />
            {state.pendingPromotion && (
              <PromotionDialog
                side={state.playerColor}
                onPick={handlePromotionPick}
                onCancel={handlePromotionCancel}
              />
            )}
          </div>
          <GameControls
            difficulty={state.difficulty}
            nextPlayerColor={state.nextPlayerColor}
            playing={!state.result}
            resignArmed={state.resignArmed}
            onDifficulty={(difficulty) =>
              dispatch({ type: "setDifficulty", difficulty })
            }
            onNextPlayerColor={(side) =>
              dispatch({ type: "setNextPlayerColor", side })
            }
            onNewGame={handleNewGame}
            onResign={handleResign}
          />
        </div>
        <MoveList history={state.history} />
      </div>
      {drag && (
        <span
          aria-hidden
          style={{ left: drag.x, top: drag.y }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-3xl text-fg"
        >
          {GLYPHS[state.playerColor][drag.piece]}
        </span>
      )}
    </>
  );
}
