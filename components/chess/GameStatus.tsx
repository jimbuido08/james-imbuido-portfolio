import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { Difficulty, GameResult } from "@/types/chess";
import { MonoKicker } from "@/components/ui/MonoKicker";

/** Live status line above the board, plus the game-over panel once a result exists. */
export function GameStatus({
  statusLine,
  result,
  difficulty,
  onNewGame,
  children,
}: {
  statusLine: string;
  result: GameResult | null;
  /** The game's locked difficulty, shown as a static label beside the status line. */
  difficulty?: Difficulty;
  onNewGame: () => void;
  /** Phase 7 seam: the reward claim UI (RewardClaim) renders here. */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <MonoKicker aria-live="polite">{statusLine}</MonoKicker>
        {difficulty && (
          <MonoKicker className="shrink-0">
            Difficulty: {difficulty.toUpperCase()}
          </MonoKicker>
        )}
      </div>
      {result && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-6">
          <p className="text-lg font-semibold tracking-tight">{statusLine}</p>
          {children}
          <div className="mt-4">
            <Button size="sm" onClick={onNewGame}>
              New game
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
