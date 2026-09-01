import type { Metadata } from "next";

import { ChessGame } from "@/components/chess/ChessGame";
import { CHESS_REWARD_CREDITS } from "@/lib/credits/constants";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "Chess AI — James Imbuido",
  description: "Play against a chess model that runs entirely in your browser.",
};

export default function ChessPage() {
  return (
    <PageShell href="/chess">
      <p className="mt-8 max-w-prose text-fg-muted">
        Every move is checked by a real rules engine, and the opponent runs
        entirely client-side — no server decides a single move. Each difficulty
        is its own neural network, trained on games by human players in that
        rating band and served as a ~0.7&nbsp;MB ONNX artifact that loads only
        when you pick it.
      </p>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        If the model can&apos;t load, a heuristic opponent steps in through the
        same interface — the game never breaks. Checkmate the AI on any
        difficulty while signed in to claim a one-time +{CHESS_REWARD_CREDITS}{" "}
        JTB interaction reward.
      </p>
      <ChessGame />
    </PageShell>
  );
}
