"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { AI_ML_CATEGORIES, UNIVERSE_NODES } from "@/lib/universe/config";

import { nodePositions } from "./nodePositions";

const parent = new THREE.Vector3();
const child = new THREE.Vector3();

/**
 * Faint parent→satellite lines from the AI/ML node to each category satellite,
 * reinforcing the fan. Endpoints track live world positions (see nodePositions):
 * both the parent and the satellites drift under drei `Float`, so a static line
 * would visibly miss. Thinner/fainter than the core→node lines (opacity 0.2 vs
 * 0.45) — the satellites are subordinate.
 */
export function CategoryConnections() {
  const lines = useRef<Array<Line2 | LineSegments2 | null>>([]);

  useFrame(() => {
    AI_ML_CATEGORIES.forEach((cat, i) => {
      const line = lines.current[i];
      const parentPos = nodePositions.get(cat.parentId ?? "ai-ml");
      const childPos = nodePositions.get(cat.id);
      if (!line || !parentPos || !childPos) return;
      line.worldToLocal(parent.copy(parentPos));
      line.worldToLocal(child.copy(childPos));
      line.geometry.setPositions([
        parent.x, parent.y, parent.z,
        child.x, child.y, child.z,
      ]);
    });
  });

  return (
    <>
      {AI_ML_CATEGORIES.map((cat, i) => {
        const parentDef = UNIVERSE_NODES.find((n) => n.id === cat.parentId);
        const from = parentDef?.position ?? [0, 0, 0];
        return (
          <Line
            key={cat.id}
            ref={(el) => {
              lines.current[i] = el;
            }}
            points={[from, cat.position]}
            color={cat.accent}
            transparent
            opacity={0.2}
            lineWidth={1}
          />
        );
      })}
    </>
  );
}
