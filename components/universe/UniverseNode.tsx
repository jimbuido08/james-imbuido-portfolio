"use client";

import { Float, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";

import { NODE_RADIUS } from "@/lib/universe/config";
import type { UniverseNodeDef } from "@/lib/universe/config";

import { NodeLabel } from "./NodeLabel";
import { nodePositions } from "./nodePositions";

type UniverseNodeProps = {
  def: UniverseNodeDef;
  selectedId: string | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  reducedMotion: boolean;
  coreRef: RefObject<THREE.Group | null>;
};

/**
 * Single orbit node. State machine: idle → hover → selected (§11.2).
 * Scale targets: idle 1 / hover 1.35 / selected 1.7, eased in useFrame.
 * Reduced motion: no Float drift and scale snaps instantly.
 */
export function UniverseNode({
  def,
  selectedId,
  onHover,
  onSelect,
  reducedMotion,
  coreRef,
}: UniverseNodeProps) {
  const [hovered, setHovered] = useState(false);
  const mesh = useRef<THREE.Mesh>(null);
  const isSelected = selectedId === def.id;
  const targetScale = isSelected ? 1.7 : hovered ? 1.35 : 1;

  // Persistent vector tracked in the shared registry so ConnectionLines can
  // reach this node's live center even while Float drifts it off def.position.
  const worldPosition = useMemo(
    () => new THREE.Vector3(...def.position),
    [def.position],
  );
  useEffect(() => {
    nodePositions.set(def.id, worldPosition);
    return () => {
      nodePositions.delete(def.id);
    };
  }, [def.id, worldPosition]);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.getWorldPosition(worldPosition);
    if (reducedMotion) {
      mesh.current.scale.setScalar(targetScale);
    } else {
      const next =
        mesh.current.scale.x +
        (targetScale - mesh.current.scale.x) * (1 - Math.exp(-10 * delta));
      mesh.current.scale.setScalar(next);
    }
  });

  const node = (
    <>
      <mesh
        ref={mesh}
        position={def.position}
        onClick={(e) => {
          e.stopPropagation();
          if (!selectedId) onSelect(def);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(def);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHover(null);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[NODE_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color={def.accent}
          emissive={def.accent}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0.22}
          roughness={0.4}
        />
      </mesh>
      {/* Always-visible name + subtitle, glued to the node. Hidden while any
          node is selected so labels don't clutter the camera glide. Occluded
          against the core so the label disappears when the node orbits behind
          it — scoped to coreRef only so the particle field can't falsely hide it.
          The low z-range keeps the inline z-index under the header (z-50); drei's
          default (≈16.7M) escapes the canvas and paints over the mobile menu. */}
      {selectedId === null && (
        <Html
          position={[def.position[0], def.position[1] - 0.5, def.position[2]]}
          center
          pointerEvents="none"
          occlude={[coreRef as RefObject<THREE.Object3D>]}
          zIndexRange={[10, 0]}
        >
          <NodeLabel def={def} />
        </Html>
      )}
    </>
  );

  if (reducedMotion) return node;

  return (
    <Float
      speed={1.4}
      rotationIntensity={0.25}
      floatIntensity={0.9}
      floatingRange={[-0.12, 0.12]}
    >
      {node}
    </Float>
  );
}
