import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "JTB — James Imbuido",
  description: "A chatbot grounded in approved information about James's work.",
};

export default function JtbPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="jtb">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="JTB — James Talks Back"
        description="A chatbot grounded in approved information about James's work."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        JTB requires sign-in and arrives in Phase 6. Placeholder content.
      </p>
      {/* TODO(PHASE-6): JTB chat UI + auth + credit system per §5/§6 */}
    </Container>
  );
}
