import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { GameResult } from "@/types/chess";

/** Live status line above the board, plus the game-over panel once a result exists. */
export function GameStatus({
  statusLine,
  result,
  onNewGame,
  children,
}: {
  statusLine: string;
  result: GameResult | null;
  onNewGame: () => void;
  /** Phase 7 seam: the reward claim UI (RewardClaim) renders here. */
  children?: ReactNode;
}) {
  return (
    <>
      <p
        aria-live="polite"
        className="mb-4 font-mono text-xs uppercase tracking-widest text-fg-subtle"
      >
        {statusLine}
      </p>
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
