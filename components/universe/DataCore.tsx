"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { UNIVERSE_COLORS } from "@/lib/universe/config";

/**
 * Central "data core" (§2.1): a wireframe icosahedron shell around an emissive
 * sphere. Slow rotation, skipped under reduced motion.
 */
export function DataCore({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (reducedMotion || !group.current) return;
    group.current.rotation.y += delta * 0.1;
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial wireframe color={UNIVERSE_COLORS.borderStrong} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshStandardMaterial
          color={UNIVERSE_COLORS.surface2}
          emissive={UNIVERSE_COLORS.accentAi}
          emissiveIntensity={0.18}
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}
