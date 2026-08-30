/** §23 categories, extended with CLASSICAL_ML and AGENTS per §3.3's filter list. */
export type ProjectCategory =
  | "AI"
  | "ML"
  | "CLASSICAL_ML" // §3.3 filter; not in §23 — documented divergence
  | "LLM"
  | "NLP"
  | "AGENTS" // §3.3 filter; not in §23 — documented divergence
  | "ENGINEERING"
  | "EXPERIMENT";

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
  /** Kaggle notebook / competition submission URL (AI projects). */
  kaggleUrl?: string;
  image?: string;
  interactive: boolean;
  // §8.1 case-study fields (ML pages); empty string = section omitted
  data: string;
  models: string;
  evaluation: string;
}
