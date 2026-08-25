"use client";

import { Tag } from "@/components/ui/Tag";
import type { UniverseNodeDef } from "@/lib/universe/config";

type UniverseOverlayProps = {
  hovered: UniverseNodeDef | null;
  selected: UniverseNodeDef | null;
  reducedMotion: boolean;
  /** The interaction hint only makes sense when the canvas is actually present. */
  showHint: boolean;
};

/** DOM overlay inside the client boundary — pointer-events-none. */
export function UniverseOverlay({
  hovered,
  selected,
  reducedMotion,
  showHint,
}: UniverseOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-between p-6 sm:p-8">
      {hovered && !selected && (
        <div className="rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur">
          <Tag domain={hovered.domain}>{hovered.label}</Tag>
          <p className="mt-1 text-sm text-fg-muted">{hovered.blurb}</p>
          <p className="font-mono text-xs text-fg-subtle">Click to enter →</p>
        </div>
      )}
      {selected && (
        <div className="rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur">
          <Tag domain={selected.domain}>{selected.label}</Tag>
          <p className="mt-1 text-sm text-fg-muted">
            Selected: entering {selected.label}…
          </p>
        </div>
      )}
      {showHint && !reducedMotion && (
        <p className="hidden font-mono text-xs text-fg-subtle md:block">
          Drag to rotate · Scroll to zoom · Click a node to enter
        </p>
      )}
    </div>
  );
}
