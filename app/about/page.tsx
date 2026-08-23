import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "About — James Imbuido",
  description: "Who I am and how I work.",
};

export default function AboutPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="neutral">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="About"
        description="Who I am and how I work."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        This section is under construction. Full bio and story land in Phase 3.
        Placeholder content.
      </p>
      {/* TODO(PHASE-3): real content per master plan §8.1 content model */}
    </Container>
  );
}
