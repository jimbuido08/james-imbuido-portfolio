import { useEffect, useRef } from "react";

import { GLYPHS } from "@/components/chess/ChessBoard";
import type { PromotionChoice, Side } from "@/types/chess";
import { MonoKicker } from "@/components/ui/MonoKicker";

const CHOICES: Array<{ key: PromotionChoice; label: string }> = [
  { key: "q", label: "queen" },
  { key: "r", label: "rook" },
  { key: "b", label: "bishop" },
  { key: "n", label: "knight" },
];

/** In-board overlay for promotion choice — never auto-queen (§3.7 of the plan). */
export function PromotionDialog({
  side,
  onPick,
  onCancel,
}: {
  side: Side;
  onPick: (choice: PromotionChoice) => void;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      className="absolute inset-0 z-10 flex items-center justify-center bg-bg/70"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <MonoKicker>Promote to</MonoKicker>
        <div className="mt-3 flex gap-2">
          {CHOICES.map((choice, i) => (
            <button
              key={choice.key}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              aria-label={`Promote to ${choice.label}`}
              className="h-14 w-14 rounded-md border border-border bg-surface-2 text-3xl text-fg hover:border-border-strong"
              onClick={() => onPick(choice.key)}
            >
              <span aria-hidden>{GLYPHS[side][choice.key]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
