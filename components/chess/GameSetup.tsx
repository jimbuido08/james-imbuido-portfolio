import { Button } from "@/components/ui/Button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
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
 * Pre-game configuration gate: the board is not rendered until the user picks
 * a difficulty and a color and presses Start game. Difficulty stays locked for
 * the whole game — this is the only place to change it.
 */
export function GameSetup({
  difficulty,
  nextPlayerColor,
  onDifficulty,
  onNextPlayerColor,
  onStartGame,
}: {
  difficulty: Difficulty;
  nextPlayerColor: Side;
  onDifficulty: (difficulty: Difficulty) => void;
  onNextPlayerColor: (side: Side) => void;
  onStartGame: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a game</CardTitle>
        <CardDescription>
          Pick a difficulty and your color, then press Start game.
        </CardDescription>
      </CardHeader>
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
      </div>
      <CardFooter>
        <Button data-chess-start onClick={onStartGame}>
          Start game
        </Button>
      </CardFooter>
    </Card>
  );
}
