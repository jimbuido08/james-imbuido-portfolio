import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "Data Visualisation — James Imbuido",
  description: "Dashboards and custom visualisations.",
};

export default function DataPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="data">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="Data Visualisation"
        description="Dashboards and custom visualisations."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        Project pages land in Phase 3; Tableau/Power BI embeds in Phase 8.
        Placeholder content.
      </p>
      {/* TODO(PHASE-3): real content per master plan §8.1 content model */}
    </Container>
  );
}
