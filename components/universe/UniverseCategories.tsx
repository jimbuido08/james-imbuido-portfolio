"use client";

import type { RefObject } from "react";
import type * as THREE from "three";

import { AI_ML_CATEGORIES, SATELLITE_RADIUS } from "@/lib/universe/config";
import type { UniverseNodeDef } from "@/lib/universe/config";

import { UniverseNode } from "./UniverseNode";

type UniverseCategoriesProps = {
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  reducedMotion: boolean;
  coreRef: RefObject<THREE.Group | null>;
};

/** AI/ML category satellites — same node behaviour as the main nodes. */
export function UniverseCategories({
  selected,
  onHover,
  onSelect,
  reducedMotion,
  coreRef,
}: UniverseCategoriesProps) {
  return (
    <>
      {AI_ML_CATEGORIES.map((def) => (
        <UniverseNode
          key={def.id}
          def={def}
          radius={SATELLITE_RADIUS}
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
