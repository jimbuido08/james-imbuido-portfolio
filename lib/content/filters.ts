import type { Project } from "@/types/project";

export interface FilterDef {
  key: string;
  label: string;
  matches: (project: Project) => boolean;
}

/** §3.3 — /ai-ml. Chips: ALL + CLASSICAL ML, NLP, AGENTS, EXPERIMENTS (LLM dropped). */
export const AI_ML_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL", matches: () => true },
  {
    key: "classical-ml",
    label: "CLASSICAL ML",
    matches: (p) => p.category === "CLASSICAL_ML",
  },
  { key: "nlp", label: "NLP", matches: (p) => p.category === "NLP" },
  { key: "agents", label: "AGENTS", matches: (p) => p.category === "AGENTS" },
  {
    key: "experiments",
    label: "EXPERIMENTS",
    matches: (p) => p.category === "EXPERIMENT",
  },
];
