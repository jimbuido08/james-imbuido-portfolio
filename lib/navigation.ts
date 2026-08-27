/**
 * The site's canonical route list — single source of truth for navigation.
 * The header derives its link groups from this, the Data Universe derives its
 * node routes from it, and the homepage index grid mirrors it, so a route can
 * never drift between the conventional nav and the 3D layer (§11.1, §31 P5).
 *
 * Plain module (no "use client", no server-only imports) — safe for both the
 * server-rendered header and client components.
 */

export interface NavItem {
  href: string;
  /** Header label — the short form; the Universe keeps its own full labels. */
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/about", label: "About" },
  { href: "/experience", label: "Experience" },
  { href: "/ai-ml", label: "AI/ML" },
  { href: "/jtb", label: "JTB" },
  { href: "/chess", label: "Chess" },
  { href: "/contact", label: "Contact" },
] as const;
