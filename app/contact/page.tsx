import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "Contact — James Imbuido",
  description: "Get in touch.",
};

export default function ContactPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="neutral">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="Contact"
        description="Get in touch."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        Contact form lands in a later phase. Placeholder content.
      </p>
      {/* TODO(PHASE-3): contact details + form per §22 */}
    </Container>
  );
}
