import type { Project } from "@/types/project";

export interface FilterDef {
  key: string;
  label: string;
  matches: (project: Project) => boolean;
}

/** True when the project's frontmatter technologies list any of `names` (case-insensitive). */
function hasTechnology(project: Project, names: string[]): boolean {
  return project.technologies.some((tech) =>
    names.includes(tech.trim().toLowerCase()),
  );
}

/**
 * §3.3 — /ai-ml. Chips: ALL + CLASSICAL ML, NLP, AGENTS, EXPERIMENTS (LLM dropped),
 * plus framework chips (PYTORCH, TENSORFLOW) that match on the technologies
 * frontmatter rather than the single category.
 */
export const AI_ML_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL", matches: () => true },
  {
    key: "classical-ml",
    label: "CLASSICAL ML",
    matches: (p) => p.category === "CLASSICAL_ML",
  },
  {
    key: "pytorch",
    label: "PYTORCH",
    matches: (p) => hasTechnology(p, ["pytorch"]),
  },
  {
    key: "tensorflow",
    // Keras is TensorFlow's high-level API — tag with either spelling.
    label: "TENSORFLOW",
    matches: (p) => hasTechnology(p, ["tensorflow", "keras"]),
  },
  { key: "nlp", label: "NLP", matches: (p) => p.category === "NLP" },
  { key: "agents", label: "AGENTS", matches: (p) => p.category === "AGENTS" },
  {
    key: "experiments",
    label: "EXPERIMENTS",
    matches: (p) => p.category === "EXPERIMENT",
  },
];
