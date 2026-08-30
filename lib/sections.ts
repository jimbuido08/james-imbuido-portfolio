/**
 * The SectionDef registry — one entry per main site section. A route's label,
 * page heading (h1), and description live here once; the header nav
 * (lib/navigation.ts) and each page's shell (PageShell) read from this
 * registry, so renaming or re-blurbing a section is a one-line edit (§15).
 *
 * Flow pages (/login, /signup, /account) share the shell vocabulary but are
 * never nav items — they live in FLOWS below. Plain module — safe for server
 * and client.
 */

export interface SectionDef {
  href: string;
  /** Header/nav + universe node label — the short form. */
  label: string;
  /** Page heading; differs from the label where the full name is longer. */
  h1: string;
  description: string;
}

export const SECTIONS: readonly SectionDef[] = [
  {
    href: "/about",
    label: "About",
    h1: "About",
    description:
      "Who James Imbuido is — from nursing to data science, and how he thinks about technology.",
  },
  {
    href: "/experience",
    label: "Experience",
    h1: "Experience",
    description:
      "Professional experience and education — data scientist at Commonwealth Bank of Australia.",
  },
  {
    href: "/ai-ml",
    label: "AI Projects",
    h1: "AI Projects",
    description: "Machine learning, LLM, and AI engineering projects.",
  },
  {
    href: "/jtb",
    label: "JTB",
    h1: "JTB — James Talks Back",
    description:
      "Ask JTB about James's work, experience, skills, and projects.",
  },
  {
    href: "/chess",
    label: "Chess",
    h1: "Chess AI",
    description:
      "Play against a chess model that runs entirely in your browser.",
  },
  {
    href: "/contact",
    label: "Contact",
    h1: "Contact",
    description:
      "How to reach James Imbuido — email, LinkedIn, GitHub, Kaggle.",
  },
] as const;

/** Flow pages: the same shell contract, excluded from NAV_ITEMS by design. */
export const FLOWS: readonly SectionDef[] = [
  {
    href: "/login",
    label: "Sign in",
    h1: "Sign in",
    description: "Welcome back.",
  },
  {
    href: "/signup",
    label: "Sign up",
    h1: "Sign up",
    description: "Create an account — email, password, and employment status.",
  },
  {
    href: "/account",
    label: "Account",
    h1: "Account",
    description: "Signed in as you.",
  },
] as const;

/** A route's SectionDef, or undefined for pages outside the registry. */
export function sectionFor(href: string): SectionDef | undefined {
  return [...SECTIONS, ...FLOWS].find((s) => s.href === href);
}
