"use client";

import { Line } from "@react-three/drei";

import { UNIVERSE_COLORS, UNIVERSE_NODES } from "@/lib/universe/config";

/**
 * Faint lines from the core (origin) to each node. lineWidth is 1px on most
 * GPUs regardless — thin is intended; no fat lines.
 */
export function ConnectionLines() {
  return (
    <>
      {UNIVERSE_NODES.map((node) => (
        <Line
          key={node.id}
          points={[[0, 0, 0], node.position]}
          color={UNIVERSE_COLORS.border}
          transparent
          opacity={0.6}
          lineWidth={1}
        />
      ))}
    </>
  );
}
