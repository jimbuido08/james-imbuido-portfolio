import type { Project, ProjectCategory } from "@/types/project";

/**
 * §3.3 — /ai-ml filter chips, as data. A FilterDef says nothing about *how*
 * matching works — `projectMatchesFilter` is the one matcher, so a new filter
 * is a one-line entry here (the seam that already lets framework chips land
 * without touching ProjectGrid now extends to any future dimension).
 */
export interface FilterDef {
  key: string;
  label: string;
  /** Match the project's single category exactly — or a family of categories. */
  category?: ProjectCategory | ProjectCategory[];
  /** Match on the technologies frontmatter, case-insensitive. */
  technologies?: string[];
}

/** Chips: ALL + the category families, plus framework chips (PYTORCH, TENSORFLOW). */
export const AI_ML_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL" },
  { key: "classical-ml", label: "CLASSICAL ML", category: "CLASSICAL_ML" },
  { key: "llm", label: "LLM", category: "LLM" },
  { key: "pytorch", label: "PYTORCH", technologies: ["pytorch"] },
  {
    key: "tensorflow",
    // Keras is TensorFlow's high-level API — tag with either spelling.
    label: "TENSORFLOW",
    technologies: ["tensorflow", "keras"],
  },
  { key: "nlp", label: "NLP", category: "NLP" },
  { key: "agents", label: "AGENTS", category: "AGENTS" },
  { key: "experiments", label: "EXPERIMENTS", category: "EXPERIMENT" },
];

/**
 * The one filter matcher. Unrecognised defs (neither field set) match
 * everything — the "ALL" chip is data, not a special case.
 */
export function projectMatchesFilter(
  project: Project,
  def: FilterDef,
): boolean {
  if (def.category) {
    return Array.isArray(def.category)
      ? def.category.includes(project.category)
      : project.category === def.category;
  }
  if (def.technologies) {
    const wanted = def.technologies.map((name) => name.trim().toLowerCase());
    return project.technologies.some((tech) =>
      wanted.includes(tech.trim().toLowerCase()),
    );
  }
  return true;
}
