/**
 * Server-only module: imports `fs`; never import from client components.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import type { Project, ProjectCategory } from "@/types/project";

const CATEGORIES: ProjectCategory[] = [
  "AI",
  "ML",
  "CLASSICAL_ML",
  "LLM",
  "NLP",
  "AGENTS",
  "DATA_VISUALISATION",
  "TABLEAU",
  "POWER_BI",
  "ENGINEERING",
  "EXPERIMENT",
];

type ContentKind = "projects" | "visualisations";

/** Required §23 core fields that have no default — must exist in frontmatter. */
const REQUIRED_FIELDS = [
  "title",
  "category",
  "description",
  "technologies",
  "problem",
  "approach",
  "results",
  "lessons",
] as const;

function validateProject(
  data: Record<string, unknown>,
  filePath: string,
  slug: string,
): Project {
  for (const field of REQUIRED_FIELDS) {
    if (typeof data[field] !== "string" && field !== "technologies") {
      throw new Error(
        `Invalid frontmatter in ${filePath}: missing or mistyped "${field}"`,
      );
    }
  }

  const category = data.category as ProjectCategory;
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: unknown category "${String(data.category)}"`,
    );
  }

  if (
    !Array.isArray(data.technologies) ||
    data.technologies.some((item) => typeof item !== "string")
  ) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: "technologies" must be a string[]`,
    );
  }

  for (const field of ["keyInsights", "tools"] as const) {
    const value = data[field];
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    ) {
      throw new Error(
        `Invalid frontmatter in ${filePath}: "${field}" must be a string[]`,
      );
    }
  }

  const embedUrl = data.embedUrl;
  if (embedUrl !== undefined && typeof embedUrl !== "string") {
    throw new Error(
      `Invalid frontmatter in ${filePath}: "embedUrl" must be a string`,
    );
  }
  if (typeof embedUrl === "string" && !embedUrl.includes("TODO")) {
    const allowlist: Record<string, (host: string) => boolean> = {
      tableau: (h) => h === "public.tableau.com" || h.endsWith(".tableau.com"),
      power_bi: (h) => h === "app.powerbi.com",
    };
    const embedType = data.embedType as string | undefined;
    const allowed = embedType && allowlist[embedType];
    let parsed: URL;
    try {
      parsed = new URL(embedUrl);
    } catch {
      throw new Error(
        `Invalid frontmatter in ${filePath}: "embedUrl" is not a valid URL`,
      );
    }
    if (
      parsed.protocol !== "https:" ||
      (allowed && !allowed(parsed.hostname))
    ) {
      throw new Error(
        `Invalid frontmatter in ${filePath}: "embedUrl" must be an https URL on the vendor host for embedType "${String(embedType)}"`,
      );
    }
  }

  return {
    slug,
    title: data.title as string,
    category,
    description: data.description as string,
    // Defaults for optional-but-listed fields — missing frontmatter is silent.
    featured: (data.featured as boolean) ?? false,
    interactive: (data.interactive as boolean) ?? false,
    data: (data.data as string) ?? "",
    models: (data.models as string) ?? "",
    evaluation: (data.evaluation as string) ?? "",
    technologies: data.technologies as string[],
    problem: data.problem as string,
    approach: data.approach as string,
    results: data.results as string,
    lessons: data.lessons as string,
    githubUrl: data.githubUrl as string | undefined,
    demoUrl: data.demoUrl as string | undefined,
    image: data.image as string | undefined,
    businessContext: data.businessContext as string | undefined,
    dataset: data.dataset as string | undefined,
    keyInsights: data.keyInsights as string[] | undefined,
    tools: data.tools as string[] | undefined,
    embedType: data.embedType as Project["embedType"] | undefined,
    embedUrl: data.embedUrl as string | undefined,
  };
}

function readDir(kind: ContentKind): Project[] {
  const dir = path.join(process.cwd(), "content", kind);
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".md"));
  } catch {
    return []; // missing directory → empty state, never a build failure
  }
  if (files.length === 0) return [];

  return files
    .map((file) => {
      const filePath = path.join(dir, file);
      const { data } = matter(readFileSync(filePath, "utf8"));
      const slug = file.replace(/\.md$/, "");
      return validateProject(data, filePath, slug);
    })
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

export function getProjects(): Project[] {
  return readDir("projects");
}

export function getProjectBySlug(slug: string): Project | undefined {
  return readDir("projects").find((project) => project.slug === slug);
}

export function getVisualisations(): Project[] {
  return readDir("visualisations");
}

export function getVisualisationBySlug(slug: string): Project | undefined {
  return readDir("visualisations").find((project) => project.slug === slug);
}
