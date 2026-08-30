import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { AI_ML_FILTERS } from "@/lib/content/filters";
import { getProjects } from "@/lib/content/projects";

export const metadata: Metadata = {
  title: "AI Projects — James Imbuido",
  description: "Machine learning, LLM, and AI engineering projects.",
};

export default function AiMlPage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="AI Projects"
        description="Machine learning, LLM, and AI engineering projects."
      />
      <ProjectGrid
        projects={getProjects()}
        filters={AI_ML_FILTERS.map(({ key, label }) => ({ key, label }))}
        hrefBase="/ai-ml"
        emptyMessage="No AI projects match this filter."
      />
    </Container>
  );
}
