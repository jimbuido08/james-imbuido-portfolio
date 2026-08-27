import type { Metadata } from "next";

import { ChessGame } from "@/components/chess/ChessGame";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CHESS_REWARD_CREDITS } from "@/lib/credits/constants";

export const metadata: Metadata = {
  title: "Chess AI — James Imbuido",
  description: "Play against a chess model that runs entirely in your browser.",
};

export default function ChessPage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Chess AI"
        description="Play against a chess model that runs entirely in your browser."
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        Every move is checked by a real rules engine, and the opponent runs
        entirely client-side — no server decides a single move.
      </p>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        The trained model hasn&apos;t been exported for the browser yet, so a
        heuristic stand-in runs through the same interface it will use.
        Checkmate the AI on any difficulty while signed in to claim a one-time +
        {CHESS_REWARD_CREDITS} JTB interaction reward.
      </p>
      <ChessGame />
    </Container>
  );
}
