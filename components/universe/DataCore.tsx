"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { UNIVERSE_COLORS } from "@/lib/universe/config";

/**
 * Central "data core" (§2.1): a wireframe icosahedron shell around an emissive
 * sphere, labelled "James" — James at the centre of the data universe.
 * Slow rotation, skipped under reduced motion. The label hides during the
 * node-selection camera glide, same as the node labels.
 */
export function DataCore({
  reducedMotion,
  labelVisible,
}: {
  reducedMotion: boolean;
  labelVisible: boolean;
}) {
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
      {labelVisible && (
        // On the Y rotation axis, so the core's spin never moves the label.
        <Html position={[0, -1.4, 0]} center pointerEvents="none">
          <span
            className="whitespace-nowrap font-mono text-xs uppercase tracking-wider"
            style={{
              color: UNIVERSE_COLORS.fg,
              textShadow: "0 1px 6px rgba(0, 0, 0, 0.9)",
            }}
          >
            James
          </span>
        </Html>
      )}
    </group>
  );
}
