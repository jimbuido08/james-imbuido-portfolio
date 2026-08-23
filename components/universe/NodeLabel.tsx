"use client";

import type { UniverseNodeDef } from "@/lib/universe/config";

/**
 * Always-visible one-line DOM label under a node: the (short) name in the
 * node's accent colour — mono, uppercase, matching the Tag style.
 * Rendered via drei <Html> so it stays glued to the node as the camera moves.
 */
export function NodeLabel({ def }: { def: UniverseNodeDef }) {
  return (
    // text-shadow halo keeps labels legible over the hero copy when projected
    // nodes crowd together (e.g. narrow viewports).
    <span
      className="whitespace-nowrap font-mono text-xs uppercase tracking-wider"
      style={{ color: def.accent, textShadow: "0 1px 6px rgba(0, 0, 0, 0.9)" }}
    >
      {def.shortLabel ?? def.label}
    </span>
  );
}
