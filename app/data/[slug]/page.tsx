import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { VisualisationEmbed } from "@/components/visualisations/VisualisationEmbed";
import {
  getVisualisationBySlug,
  getVisualisations,
} from "@/lib/content/projects";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getVisualisations().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/data/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getVisualisationBySlug(slug);
  if (!project) return { title: "Project not found — James Imbuido" };
  return {
    title: `${project.title} — James Imbuido`,
    description: project.description,
  };
}

function Paragraphs({ text }: { text: string }) {
  return text.split("\n\n").map((paragraph, index) => (
    <p
      key={index}
      className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted"
    >
      {paragraph}
    </p>
  ));
}

export default async function VisualisationPage({
  params,
}: PageProps<"/data/[slug]">) {
  const { slug } = await params;
  const project = getVisualisationBySlug(slug);
  if (!project) notFound();

  const githubUrl =
    project.githubUrl && !project.githubUrl.includes("TODO")
      ? project.githubUrl
      : undefined;
  const demoUrl =
    project.demoUrl && !project.demoUrl.includes("TODO")
      ? project.demoUrl
      : undefined;

  return (
    <Container className="py-16 sm:py-24">
      <Button href="/data" variant="ghost" size="sm">
        ← All visualisations
      </Button>
      <div className="mt-6 flex flex-wrap gap-2">
        <Tag domain="data">{project.category.replaceAll("_", " ")}</Tag>
        {project.featured && <Tag domain="neutral">Featured</Tag>}
      </div>
      <SectionHeading
        as="h1"
        title={project.title}
        description={project.description}
        className="mt-4"
      />
      {project.businessContext && (
        <section>
          <SectionHeading as="h2" title="Context" className="mt-14" />
          <Paragraphs text={project.businessContext} />
        </section>
      )}
      <VisualisationEmbed project={project} />
      <section>
        <SectionHeading as="h2" title="Key Insights" className="mt-14" />
        {project.keyInsights && project.keyInsights.length > 0 ? (
          <ul className="mt-4 max-w-prose list-disc space-y-2 pl-5 text-base leading-relaxed text-fg-muted">
            {project.keyInsights.map((insight, index) => (
              <li key={index}>{insight}</li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 max-w-prose list-disc space-y-2 pl-5 text-base leading-relaxed text-fg-muted">
            <li>
              <span className="font-mono text-fg-subtle">
                [TODO: James — your key insights from this dashboard]
              </span>
            </li>
          </ul>
        )}
      </section>
      <section>
        <SectionHeading as="h2" title="Technical Approach" className="mt-14" />
        <Paragraphs text={project.approach} />
      </section>
      {project.dataset && (
        <section>
          <SectionHeading as="h2" title="Dataset" className="mt-14" />
          <Paragraphs text={project.dataset} />
        </section>
      )}
      <section>
        <SectionHeading as="h2" title="Tools" className="mt-14" />
        <ul className="mt-4 flex flex-wrap gap-2">
          {(project.tools ?? []).map((tool) => (
            <li key={tool}>
              <Tag domain="neutral">{tool}</Tag>
            </li>
          ))}
        </ul>
      </section>
      {(githubUrl || demoUrl) && (
        <section>
          <SectionHeading as="h2" title="Links" className="mt-14" />
          <div className="mt-4 flex gap-2">
            {githubUrl && (
              <Button href={githubUrl} variant="ghost">
                ↗ GitHub
              </Button>
            )}
            {demoUrl && (
              <Button href={demoUrl} variant="ghost">
                ↗ Live demo
              </Button>
            )}
          </div>
        </section>
      )}
    </Container>
  );
}
