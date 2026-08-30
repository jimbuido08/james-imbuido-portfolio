import Link from "next/link";

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { isInternalUrl } from "@/lib/url";
import type { Project } from "@/types/project";

const linkClasses =
  "text-sm text-fg-muted underline underline-offset-4 decoration-border hover:decoration-border-strong";

export function ProjectCard({
  project,
  hrefBase,
}: {
  project: Project;
  hrefBase: string;
}) {
  // Placeholder URLs are already undefined — the loader owns that rule.
  const { githubUrl, demoUrl, kaggleUrl } = project;

  return (
    <Card interactive>
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <Tag domain="ai">{project.category.replaceAll("_", " ")}</Tag>
          {project.interactive && <Tag domain="neutral">Interactive</Tag>}
        </div>
        <CardTitle>
          <Link
            href={`${hrefBase}/${project.slug}`}
            className="transition-colors hover:text-fg-muted"
          >
            {project.title}
          </Link>
        </CardTitle>
        <CardDescription>{project.description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <p className="font-mono text-xs text-fg-subtle">
          {project.technologies.join(" · ")}
        </p>
        {(githubUrl || demoUrl || kaggleUrl) && (
          <div className="mt-3 flex flex-wrap gap-4">
            {githubUrl && (
              <a href={githubUrl} className={linkClasses}>
                ↗ GitHub
              </a>
            )}
            {demoUrl &&
              (isInternalUrl(demoUrl) ? (
                // Site-relative paths navigate client-side — no full reload.
                <Link href={demoUrl} className={linkClasses}>
                  Demo
                </Link>
              ) : (
                <a href={demoUrl} className={linkClasses}>
                  ↗ Demo
                </a>
              ))}
            {kaggleUrl && (
              <a href={kaggleUrl} className={linkClasses}>
                ↗ Kaggle
              </a>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
