import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { ProseParagraphs } from "@/components/ui/Prose";
import { isInternalUrl } from "@/lib/url";
import type { Project } from "@/types/project";

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

  // Placeholder URLs are already undefined — the loader owns that rule.
  const { githubUrl, demoUrl, kaggleUrl } = project;

  return (
    <>
      {sections.map(
        ({ label, field }) =>
          field !== "" && (
            <section key={label}>
              <SectionHeading as="h2" title={label} className="mt-14" />
              <ProseParagraphs text={field} className="mt-4" />
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
      {(githubUrl || demoUrl || kaggleUrl) && (
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
                {isInternalUrl(demoUrl) ? "Live demo" : "↗ Live demo"}
              </Button>
            )}
            {kaggleUrl && (
              <Button href={kaggleUrl} variant="ghost">
                ↗ Kaggle
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
