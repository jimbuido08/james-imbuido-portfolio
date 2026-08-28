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

/**
 * DOM overlay inside the client boundary — pointer-events-none. Cards and the
 * interaction hint stack in one bottom-left column: a hovered/selected card
 * appears directly above the still-visible hint.
 */
export function UniverseOverlay({
  hovered,
  selected,
  reducedMotion,
  showHint,
}: UniverseOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-start p-6 sm:p-8">
      <div className="flex flex-col items-start gap-2">
        {hovered && !selected && (
          <div className="max-w-[min(20rem,calc(100vw-3rem))] rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur">
            <Tag domain={hovered.domain}>{hovered.label}</Tag>
            <p className="mt-1 text-sm text-fg-muted">{hovered.blurb}</p>
            <p className="font-mono text-xs text-fg-subtle">Click to enter →</p>
          </div>
        )}
        {selected && (
          <div className="max-w-[min(20rem,calc(100vw-3rem))] rounded-md border border-border bg-surface/80 px-3 py-2 backdrop-blur">
            <Tag domain={selected.domain}>{selected.label}</Tag>
            <p className="mt-1 text-sm text-fg-muted">
              Entering {selected.label}…
            </p>
          </div>
        )}
        {showHint && !reducedMotion && (
          <p className="whitespace-nowrap font-mono text-[min(0.75rem,calc((100vw-3rem)/32))] text-fg-subtle md:text-xs">
            <span className="md:hidden">
              Drag to rotate · Pinch to zoom · Tap a node to enter
            </span>
            <span className="hidden md:block">
              Drag to rotate · Scroll to zoom · Click a node to enter
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
