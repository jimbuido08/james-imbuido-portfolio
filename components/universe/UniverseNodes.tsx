"use client";

import type { RefObject } from "react";
import type * as THREE from "three";

import { UNIVERSE_NODES } from "@/lib/universe/config";
import type { UniverseNodeDef } from "@/lib/universe/config";

import { UniverseNode } from "./UniverseNode";

type UniverseNodesProps = {
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  reducedMotion: boolean;
  coreRef: RefObject<THREE.Group | null>;
};

/** Maps the node registry (§11.2 idle/hover/selected/transition states). */
export function UniverseNodes({
  selected,
  onHover,
  onSelect,
  reducedMotion,
  coreRef,
}: UniverseNodesProps) {
  return (
    <>
      {UNIVERSE_NODES.map((def) => (
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
