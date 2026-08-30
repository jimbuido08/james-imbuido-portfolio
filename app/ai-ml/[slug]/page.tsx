import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { CaseStudySections } from "@/components/projects/CaseStudySections";
import { getProjectBySlug, getProjects } from "@/lib/content/projects";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/ai-ml/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: "Project not found — James Imbuido" };
  return {
    title: `${project.title} — James Imbuido`,
    description: project.description,
  };
}

export default async function ProjectPage({
  params,
}: PageProps<"/ai-ml/[slug]">) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();
  return (
    <Container className="py-16 sm:py-24">
      <Button href="/ai-ml" variant="ghost" size="sm">
        ← All AI projects
      </Button>
      <div className="mt-6 flex flex-wrap gap-2">
        <Tag domain="ai">{project.category.replaceAll("_", " ")}</Tag>
        {project.featured && <Tag domain="neutral">Featured</Tag>}
      </div>
      <SectionHeading
        as="h1"
        title={project.title}
        description={project.description}
        className="mt-4"
      />
      <CaseStudySections project={project} />
    </Container>
  );
}
