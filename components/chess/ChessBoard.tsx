import type { KeyboardEvent, PointerEvent } from "react";

import { cx } from "@/lib/utils";
import type {
  MoveSnapshot,
  PieceType,
  Side,
  SquareName,
  SquareState,
} from "@/types/chess";

/**
 * Filled glyphs = white pieces, outline glyphs = black pieces — the side
 * distinction is the glyph set, not a color pair (zero contrast failure modes).
 */
export const GLYPHS: Record<Side, Record<PieceType, string>> = {
  w: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  b: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
};

const PIECE_NAMES: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** a1 is dark: a square is light when file index + rank number is even. */
function isLight(square: SquareName): boolean {
  const fileIdx = square.charCodeAt(0) - 97;
  return (fileIdx + Number(square[1])) % 2 === 0;
}

/** squares arrive rank-8-first, files a→h; Black orientation flips both axes. */
function orderedSquares(
  squares: SquareState[],
  orientation: Side,
): SquareState[] {
  const rows: SquareState[][] = [];
  for (let r = 0; r < 8; r++) rows.push(squares.slice(r * 8, r * 8 + 8));
  const orientedRows = orientation === "w" ? rows : [...rows].reverse();
  return orientedRows.flatMap((row) =>
    orientation === "w" ? row : [...row].reverse(),
  );
}

export function ChessBoard({
  squares,
  orientation,
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  focusSquare,
  dragging,
  onSquareClick,
  onSquareKeyDown,
  onSquareFocus,
  onSquarePointerDown,
  onSquarePointerMove,
  onSquarePointerUp,
}: {
  squares: SquareState[];
  orientation: Side;
  selected: SquareName | null;
  legalTargets: MoveSnapshot[];
  lastMove: { from: SquareName; to: SquareName } | null;
  checkSquare: SquareName | null;
  focusSquare: SquareName;
  dragging: boolean;
  onSquareClick: (square: SquareName) => void;
  onSquareKeyDown: (
    e: KeyboardEvent<HTMLButtonElement>,
    square: SquareName,
  ) => void;
  onSquareFocus: (square: SquareName) => void;
  onSquarePointerDown: (
    e: PointerEvent<HTMLButtonElement>,
    square: SquareName,
  ) => void;
  onSquarePointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onSquarePointerUp: (
    e: PointerEvent<HTMLButtonElement>,
    square: SquareName,
  ) => void;
}) {
  const targetBySquare = new Map(legalTargets.map((m) => [m.to, m]));
  const ordered = orderedSquares(squares, orientation);

  return (
    <div
      role="group"
      aria-label="Chess board"
      className="grid grid-cols-8 overflow-hidden rounded-lg border border-border"
    >
      {ordered.map(({ square, piece }, i) => {
        const colIdx = i % 8;
        const rowIdx = Math.floor(i / 8);
        const isSelected = selected === square;
        const target = targetBySquare.get(square);
        const isLastMove =
          lastMove !== null &&
          (lastMove.from === square || lastMove.to === square);
        const isCheck = checkSquare === square;
        // One background per square — never stacked competing bg utilities.
        const background = isCheck
          ? "bg-accent-exp/50"
          : isSelected
            ? "bg-accent-chess/30"
            : isLastMove
              ? "bg-accent-neut/20"
              : isLight(square)
                ? "bg-border-strong"
                : "bg-border";
        const occupant = piece
          ? `${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`
          : "empty";
        const label = `${square}, ${occupant}${isSelected ? ", selected" : ""}${
          target ? (piece ? ", legal capture" : ", legal move") : ""
        }`;
        return (
          <button
            key={square}
            type="button"
            aria-label={label}
            data-square={square}
            tabIndex={focusSquare === square ? 0 : -1}
            onClick={() => onSquareClick(square)}
            onKeyDown={(e) => onSquareKeyDown(e, square)}
            onFocus={() => onSquareFocus(square)}
            onPointerDown={(e) => onSquarePointerDown(e, square)}
            onPointerMove={onSquarePointerMove}
            onPointerUp={(e) => onSquarePointerUp(e, square)}
            className={cx(
              "relative flex aspect-square items-center justify-center",
              dragging ? "touch-none" : "touch-manipulation",
              background,
              target &&
                !piece &&
                "after:absolute after:left-1/2 after:top-1/2 after:size-[22%] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-accent-chess after:content-['']",
              target && piece && "ring-2 ring-inset ring-accent-chess",
            )}
          >
            {colIdx === 0 && (
              <span
                aria-hidden
                className="absolute left-0.5 top-0.5 font-mono text-[0.55rem] text-fg-subtle sm:text-xs"
              >
                {square[1]}
              </span>
            )}
            {rowIdx === 7 && (
              <span
                aria-hidden
                className="absolute bottom-0.5 right-0.5 font-mono text-[0.55rem] text-fg-subtle sm:text-xs"
              >
                {square[0]}
              </span>
            )}
            {piece && (
              <span
                aria-hidden
                className="select-none text-xl leading-none text-fg sm:text-2xl md:text-3xl"
              >
                {GLYPHS[piece.color][piece.type]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
