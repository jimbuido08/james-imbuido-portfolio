"use client";

import type { RefObject } from "react";
import type * as THREE from "three";

import type { UniverseNodeDef } from "@/lib/universe/config";

import { UniverseNode } from "./UniverseNode";

type NodeGroupProps = {
  nodes: UniverseNodeDef[];
  /** Sphere radius — main nodes use NODE_RADIUS; satellites pass SATELLITE_RADIUS. */
  radius?: number;
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  reducedMotion: boolean;
  coreRef: RefObject<THREE.Group | null>;
};

/**
 * Renders a list of node defs — the main constellation and the category
 * satellites both flow through this one component (§11.2 states). The
 * satellites are children of the same system, not a parallel subsystem.
 */
export function NodeGroup({
  nodes,
  radius,
  selected,
  onHover,
  onSelect,
  reducedMotion,
  coreRef,
}: NodeGroupProps) {
  return (
    <>
      {nodes.map((def) => (
        <UniverseNode
          key={def.id}
          def={def}
          radius={radius}
          selectedId={selected?.id ?? null}
          onHover={onHover}
          onSelect={onSelect}
          reducedMotion={reducedMotion}
          coreRef={coreRef}
        />
      ))}
    </>
  );
}
