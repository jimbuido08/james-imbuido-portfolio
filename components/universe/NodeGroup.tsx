"use client";

import type { RefObject } from "react";
import type * as THREE from "three";

import type { UniverseNodeDef } from "@/lib/universe/config";

import { UniverseNode } from "./UniverseNode";

type NodeGroupProps = {
  nodes: UniverseNodeDef[];
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  reducedMotion: boolean;
  coreRef: RefObject<THREE.Group | null>;
};

/** Renders the node constellation (§11.2 idle/hover/selected/transition states). */
export function NodeGroup({
  nodes,
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
