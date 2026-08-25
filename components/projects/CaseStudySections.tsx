import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { isPlaceholder } from "@/lib/content/trust";
import type { Project } from "@/types/project";

function CaseStudyParagraphs({ text }: { text: string }) {
  return text.split("\n\n").map((paragraph, index) => (
    <p
      key={index}
      className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted"
    >
      {paragraph}
    </p>
  ));
}

export function CaseStudySections({ project }: { project: Project }) {
  const sections: { label: string; field: string }[] = [
    { label: "Problem", field: project.problem },
    { label: "Data", field: project.data },
    { label: "Approach", field: project.approach },
    { label: "Models", field: project.models },
    { label: "Evaluation", field: project.evaluation },
    { label: "Results", field: project.results },
    { label: "Lessons", field: project.lessons },
  ];

  const githubUrl =
    project.githubUrl && !isPlaceholder(project.githubUrl)
      ? project.githubUrl
      : undefined;
  const demoUrl =
    project.demoUrl && !isPlaceholder(project.demoUrl)
      ? project.demoUrl
      : undefined;

  return (
    <>
      {sections.map(
        ({ label, field }) =>
          field !== "" && (
            <section key={label}>
              <SectionHeading as="h2" title={label} className="mt-14" />
              <CaseStudyParagraphs text={field} />
            </section>
          ),
      )}
      <section>
        <SectionHeading as="h2" title="Technical Stack" className="mt-14" />
        <ul className="mt-4 flex flex-wrap gap-2">
          {project.technologies.map((tech) => (
            <li key={tech}>
              <Tag domain="neutral">{tech}</Tag>
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
    </>
  );
}
