import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { VIZ_FILTERS } from "@/lib/content/filters";
import { getVisualisations } from "@/lib/content/projects";

export const metadata: Metadata = {
  title: "Data — James Imbuido",
  description: "Data visualisation projects — Tableau, Power BI, and Python.",
};

export default function DataPage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Data Visualisation"
        description="Data visualisation projects — Tableau, Power BI, and Python."
      />
      <ProjectGrid
        projects={getVisualisations()}
        filters={VIZ_FILTERS.map(({ key, label }) => ({ key, label }))}
        hrefBase="/data"
        emptyMessage="No visualisations match this filter."
      />
    </Container>
  );
}
