import type { Metadata } from "next";

import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { getProjects } from "@/lib/content/projects";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "AI Projects — James Imbuido",
  description: "Machine learning, LLM, and AI engineering projects.",
};

export default function AiMlPage() {
  return (
    <PageShell href="/ai-ml">
      <ProjectGrid
        projects={getProjects()}
        hrefBase="/ai-ml"
        emptyMessage="No AI projects match this filter."
      />
    </PageShell>
  );
}
