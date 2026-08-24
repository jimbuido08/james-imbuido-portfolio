import type { Project } from "@/types/project";

export interface FilterDef {
  key: string;
  label: string;
  matches: (project: Project) => boolean;
}

/** §3.3 — /ai-ml. Slimmed chips: ALL + CLASSICAL ML, AGENTS, EXPERIMENTS (LLM/NLP dropped). */
export const AI_ML_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL", matches: () => true },
  {
    key: "classical-ml",
    label: "CLASSICAL ML",
    matches: (p) => p.category === "CLASSICAL_ML",
  },
  { key: "agents", label: "AGENTS", matches: (p) => p.category === "AGENTS" },
  {
    key: "experiments",
    label: "EXPERIMENTS",
    matches: (p) => p.category === "EXPERIMENT",
  },
];

/** §3.4 — /data */
export const VIZ_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL", matches: () => true },
  {
    key: "tableau",
    label: "TABLEAU",
    matches: (p) => p.category === "TABLEAU",
  },
  {
    key: "power-bi",
    label: "POWER BI",
    matches: (p) => p.category === "POWER_BI",
  },
  { key: "python", label: "PYTHON", matches: (p) => p.embedType === "python" },
  {
    key: "interactive",
    label: "INTERACTIVE",
    matches: (p) => p.embedType === "interactive",
  },
];
