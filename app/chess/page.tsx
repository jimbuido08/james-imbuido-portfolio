import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "Chess AI — James Imbuido",
  description: "Play against a chess model that runs entirely in your browser.",
};

export default function ChessPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="chess">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="Chess AI"
        description="Play against a chess model that runs entirely in your browser."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        The chess experience lands in Phase 4. Placeholder content.
      </p>
      {/* TODO(PHASE-4): chess board + client-side model per §3.6, §14.2 */}
    </Container>
  );
}
