"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import type * as THREE from "three";

import { UNIVERSE_COLORS } from "@/lib/universe/config";
import { CANVAS_LABEL_Z_RANGE } from "@/lib/universe/zIndex";

/**
 * Central "data core" (§2.1): a wireframe icosahedron shell around an emissive
 * sphere, labelled "James" — James at the centre of the data universe.
 * Slow rotation, skipped under reduced motion. The label hides during the
 * node-selection camera glide, same as the node labels. `groupRef` is shared
 * with the node labels so they can occlusion-test against the core.
 */
export function DataCore({
  reducedMotion,
  labelVisible,
  groupRef,
}: {
  reducedMotion: boolean;
  labelVisible: boolean;
  groupRef: RefObject<THREE.Group | null>;
}) {
  const group = groupRef;

  useFrame((_, delta) => {
    if (reducedMotion || !group.current) return;
    // eslint-disable-next-line react-hooks/immutability -- R3F useFrame mutates the scene object every frame by design; the ref is the documented escape hatch.
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
      {/* Invisible occluder slightly larger than the wireframe shell: swallows
          pointer events so a node orbiting behind the core can't be hovered or
          clicked through it. R3F raycasts only handler-bearing objects, so
          without this the core is transparent to the pointer. */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <sphereGeometry args={[1.15, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {labelVisible && (
        // On the Y rotation axis, so the core's spin never moves the label.
        <Html
          position={[0, -1.4, 0]}
          center
          pointerEvents="none"
          zIndexRange={CANVAS_LABEL_Z_RANGE}
        >
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
