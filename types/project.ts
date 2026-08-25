/** §23 categories, extended with CLASSICAL_ML and AGENTS per §3.3's filter list. */
export type ProjectCategory =
  | "AI"
  | "ML"
  | "CLASSICAL_ML" // §3.3 filter; not in §23 — documented divergence
  | "LLM"
  | "NLP"
  | "AGENTS" // §3.3 filter; not in §23 — documented divergence
  | "DATA_VISUALISATION"
  | "TABLEAU"
  | "POWER_BI"
  | "ENGINEERING"
  | "EXPERIMENT";

export type EmbedType = "tableau" | "power_bi" | "python" | "interactive";

export interface Project {
  // §23 core
  slug: string; // derived from filename — never written in frontmatter
  title: string;
  category: ProjectCategory;
  description: string;
  featured: boolean;
  technologies: string[];
  problem: string;
  approach: string;
  results: string;
  lessons: string;
  githubUrl?: string;
  demoUrl?: string;
  image?: string;
  interactive: boolean;
  // §8.1 case-study fields (ML pages); empty string = section omitted
  data: string;
  models: string;
  evaluation: string;
  // §9/§9.1 visualisation fields (data pages)
  businessContext?: string;
  dataset?: string;
  keyInsights?: string[];
  tools?: string[];
  embedType?: EmbedType;
  /** Public vendor URL (Tableau Public / Power BI publish-to-web). Validated host-allowlisted in lib/content/projects.ts; absent or "TODO" → poster panel, never an iframe. */
  embedUrl?: string;
}
