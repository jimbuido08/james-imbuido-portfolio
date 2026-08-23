import { Button } from "@/components/ui/Button";
import type { Difficulty, Side } from "@/types/chess";

const DIFFICULTIES: Array<{ key: Difficulty; label: string }> = [
  { key: "easy", label: "EASY" },
  { key: "medium", label: "MEDIUM" },
  { key: "hard", label: "HARD" },
];

const SIDES: Array<{ key: Side; label: string }> = [
  { key: "w", label: "WHITE" },
  { key: "b", label: "BLACK" },
];

/**
 * Difficulty applies live; "Play as" is a pending preference consumed by the
 * next New game. Resign is a two-step inline confirm (≤5 s window).
 */
export function GameControls({
  difficulty,
  nextPlayerColor,
  playing,
  resignArmed,
  onDifficulty,
  onNextPlayerColor,
  onNewGame,
  onResign,
}: {
  difficulty: Difficulty;
  nextPlayerColor: Side;
  playing: boolean;
  resignArmed: boolean;
  onDifficulty: (difficulty: Difficulty) => void;
  onNextPlayerColor: (side: Side) => void;
  onNewGame: () => void;
  onResign: () => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
          Difficulty
        </p>
        <div
          className="mt-2 flex flex-wrap gap-2"
          role="group"
          aria-label="Difficulty"
        >
          {DIFFICULTIES.map((d) => (
            <Button
              key={d.key}
              size="sm"
              variant={d.key === difficulty ? "secondary" : "ghost"}
              aria-pressed={d.key === difficulty}
              onClick={() => onDifficulty(d.key)}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-fg-subtle">
          Play as
        </p>
        <div
          className="mt-2 flex flex-wrap gap-2"
          role="group"
          aria-label="Play as"
        >
          {SIDES.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={s.key === nextPlayerColor ? "secondary" : "ghost"}
              aria-pressed={s.key === nextPlayerColor}
              onClick={() => onNextPlayerColor(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onNewGame}>
          New game
        </Button>
        {playing && (
          <Button size="sm" variant="ghost" onClick={onResign}>
            {resignArmed ? "Confirm resignation" : "Resign"}
          </Button>
        )}
      </div>
    </div>
  );
}
