"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type * as THREE from "three";

import { UNIVERSE_COLORS } from "@/lib/universe/config";

/** Positions in a spherical shell (radius 4.5–9) with uniform direction. */
function generatePositions(count: number): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 4.5 + Math.random() * 4.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = radius * Math.cos(phi);
  }
  return arr;
}

/**
 * Static starfield: one `points` object — gentle rotation only, no per-particle
 * updates. Rotation stops entirely under reduced motion.
 */
export function ParticleField({
  count,
  reducedMotion,
}: {
  count: number;
  reducedMotion: boolean;
}) {
  const points = useRef<THREE.Points>(null);

  // useState lazy initializer: runs once on mount and is exempt from the
  // render-purity rule — the documented way to keep Math.random() out of the
  // render body.
  const [positions] = useState(() => generatePositions(count));

  useFrame((_, delta) => {
    if (reducedMotion || !points.current) return;
    points.current.rotation.y += delta * 0.015;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        sizeAttenuation
        color={UNIVERSE_COLORS.fgSubtle}
        transparent
        opacity={0.55}
      />
    </points>
  );
}
