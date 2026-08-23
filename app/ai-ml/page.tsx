import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "AI / Machine Learning — James Imbuido",
  description: "Machine learning and AI projects, with full case studies.",
};

export default function AiMlPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="ai">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="AI / Machine Learning"
        description="Machine learning and AI projects, with full case studies."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        Project case studies land in Phase 3 per the §8.1 template. Placeholder
        content.
      </p>
      {/* TODO(PHASE-3): real content per master plan §8.1 content model */}
    </Container>
  );
}
