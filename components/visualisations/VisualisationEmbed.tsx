import { isPlaceholder } from "@/lib/content/trust";
import type { Project } from "@/types/project";
import { LazyEmbed } from "@/components/visualisations/LazyEmbed";

const VENDOR_LABEL: Record<string, string> = {
  tableau: "Tableau Public",
  power_bi: "Power BI",
};

/**
 * §9.1/§9.2 embed slot. A validated vendor URL renders the click-to-load
 * embed; anything else renders an honest pending panel — never a fake chart.
 */
export function VisualisationEmbed({ project }: { project: Project }) {
  const embedUrl =
    project.embedUrl && !isPlaceholder(project.embedUrl)
      ? project.embedUrl
      : undefined;

  if (
    (project.embedType === "tableau" || project.embedType === "power_bi") &&
    embedUrl
  ) {
    return (
      <LazyEmbed
        embedType={project.embedType}
        embedUrl={embedUrl}
        title={project.title}
        previewImage={project.image}
      />
    );
  }

  const copy =
    project.embedType === "tableau" || project.embedType === "power_bi"
      ? `${project.title} — publishing to ${VENDOR_LABEL[project.embedType]} in progress; the interactive dashboard embeds here once live.`
      : `${project.title} — custom ${(project.embedType ?? "interactive").replaceAll("_", " ")} visualisation planned.`;

  return (
    <div className="mt-8 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 p-6">
      <p className="max-w-prose text-center font-mono text-xs uppercase tracking-widest text-fg-subtle">
        {copy}
      </p>
    </div>
  );
}
