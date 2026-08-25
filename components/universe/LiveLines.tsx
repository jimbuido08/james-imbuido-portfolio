"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { ALL_NODES } from "@/lib/universe/config";
import type { LiveLineDef } from "@/lib/universe/config";

import { nodePositions } from "./nodePositions";

const from = new THREE.Vector3();
const to = new THREE.Vector3();

/**
 * Live lines between the core/parent and each node. Both the core→node lines
 * and the parent→satellite fan lines flow through this one component; the spec
 * (fromNodeId, opacity) decides which. Endpoints track each node's live world
 * position (see nodePositions): the nodes drift under drei `Float`, so a static
 * origin→rest-position line would visibly miss the node center. The tracked
 * position is world space, so it is converted back into the line's local frame
 * (inside the pointer-parallax `Rig`).
 */
export function LiveLines({ lines }: { lines: LiveLineDef[] }) {
  const refs = useRef<Array<Line2 | LineSegments2 | null>>([]);

  useFrame(() => {
    lines.forEach((spec, i) => {
      const line = refs.current[i];
      const toPos = nodePositions.get(spec.toNodeId);
      if (!line || !toPos) return;
      if (spec.fromNodeId) {
        const fromPos = nodePositions.get(spec.fromNodeId);
        if (!fromPos) return;
        line.worldToLocal(from.copy(fromPos));
        line.worldToLocal(to.copy(toPos));
        line.geometry.setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
      } else {
        // Core→node line: the "from" endpoint is the core at the rig origin.
        line.worldToLocal(to.copy(toPos));
        line.geometry.setPositions([0, 0, 0, to.x, to.y, to.z]);
      }
    });
  });

  return (
    <>
      {lines.map((spec, i) => {
        const fromRest: [number, number, number] = spec.fromNodeId
          ? (ALL_NODES.find((n) => n.id === spec.fromNodeId)?.position ?? [0, 0, 0])
          : [0, 0, 0];
        const toRest: [number, number, number] =
          ALL_NODES.find((n) => n.id === spec.toNodeId)?.position ?? [0, 0, 0];
        return (
          <Line
            key={spec.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            points={[fromRest, toRest]}
            color={spec.accent}
            transparent
            opacity={spec.opacity}
            lineWidth={1}
          />
        );
      })}
    </>
  );
}
