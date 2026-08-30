/**
 * The site's canonical route list — derived from the SectionDef registry
 * (lib/sections.ts), which owns label + heading + description per section.
 * The header derives its link groups from this, the Data Universe derives its
 * node routes from it, and the homepage's no-WebGL fallback (UniverseFallback)
 * lists these same links, so a route can never drift between the conventional
 * nav and the 3D layer (§11.1, §31 P5).
 *
 * Plain module (no "use client", no server-only imports) — safe for both the
 * server-rendered header and client components.
 */

import { SECTIONS } from "./sections";

export interface NavItem {
  href: string;
  /** Header label — the short form; section h1s are the longer forms. */
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = SECTIONS.map((section) => ({
  href: section.href,
  label: section.label,
}));
