"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { UNIVERSE_NODES } from "@/lib/universe/config";
import { nodePositions } from "@/lib/universe/nodePositions";

const tmp = new THREE.Vector3();

/**
 * Lines from the core (origin) to each node, tinted with the node's accent
 * colour so the connections are legible. lineWidth is 1px on most GPUs
 * regardless — thin is intended; no fat lines.
 *
 * Endpoints track each node's live world position (see
 * lib/universe/nodePositions): the nodes drift under drei `Float`, so a static
 * origin→rest-position line would visibly miss the node center. The tracked
 * position is world space, so it is converted back into the line's local frame
 * (inside the pointer-parallax `Rig`). Lines are keyed by node id, matching
 * how the positions registry is indexed.
 */
export function LiveLines() {
  const lines = useRef<Map<string, Line2 | LineSegments2 | null>>(new Map());

  useFrame(() => {
    UNIVERSE_NODES.forEach((node) => {
      const line = lines.current.get(node.id);
      const world = nodePositions.get(node.id);
      if (!line || !world) return;
      line.worldToLocal(tmp.copy(world));
      line.geometry.setPositions([0, 0, 0, tmp.x, tmp.y, tmp.z]);
    });
  });

  return (
    <>
      {UNIVERSE_NODES.map((node) => (
        <Line
          key={node.id}
          ref={(el) => {
            lines.current.set(node.id, el);
          }}
          points={[[0, 0, 0], node.position]}
          color={node.accent}
          transparent
          opacity={0.45}
          lineWidth={1}
        />
      ))}
    </>
  );
}
