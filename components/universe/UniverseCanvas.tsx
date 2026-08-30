"use client";

import { OrbitControls, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useRef } from "react";
import * as THREE from "three";

import {
  CAMERA_FOV,
  CAMERA_HOME_POSITION,
  UNIVERSE_COLORS,
  UNIVERSE_NODES,
} from "@/lib/universe/config";
import type { QualityProfile, UniverseNodeDef } from "@/lib/universe/config";

import { CameraTransition } from "./CameraTransition";
import { DataCore } from "./DataCore";
import { Lighting } from "./Lighting";
import { LiveLines } from "./LiveLines";
import { ParticleField } from "./ParticleField";
import { UniverseNode } from "./UniverseNode";

/**
 * The lazy chunk's single entry: canvas element + scene composition in one
 * module, so the six-prop contract (`quality/reducedMotion/selected/onHover/
 * onSelect/onNavigate`) is declared once and `three`/`@react-three/*` never
 * leak past it. DataUniverse (outside the chunk) imports nothing from here
 * except this component via next/dynamic.
 */
type UniverseCanvasProps = {
  quality: QualityProfile;
  reducedMotion: boolean;
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  onNavigate: (route: string) => void;
};

/**
 * Pointer-parallax rig: the scene group eases toward the pointer (subtle),
 * and back to rest when a node is selected. Skipped entirely under
 * reduced motion.
 */
function Rig({
  selected,
  reducedMotion,
  children,
}: {
  selected: UniverseNodeDef | null;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (reducedMotion || !group.current) return;
    const targetY = selected ? 0 : state.pointer.x * 0.06;
    const targetX = selected ? 0 : -state.pointer.y * 0.04;
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      targetY,
      0.05,
    );
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      targetX,
      0.05,
    );
  });

  return <group ref={group}>{children}</group>;
}

/** Pure scene-graph composition — no DOM here. */
function UniverseScene({
  quality,
  reducedMotion,
  selected,
  onHover,
  onSelect,
  onNavigate,
}: UniverseCanvasProps) {
  // Shared handle on the core so node labels can occlusion-test against it,
  // hiding when the node drifts behind the "James" core.
  const coreRef = useRef<THREE.Group>(null);
  return (
    <>
      <fog attach="fog" args={[UNIVERSE_COLORS.bg, 9, 16]} />
      <Lighting />
      <Rig selected={selected} reducedMotion={reducedMotion}>
        <ParticleField
          count={quality.particles}
          reducedMotion={reducedMotion}
        />
        <Sparkles
          count={quality.sparkles}
          scale={9}
          size={1.6}
          speed={reducedMotion ? 0 : 0.25}
          opacity={0.3}
          color={UNIVERSE_COLORS.fgSubtle}
        />
        <DataCore
          reducedMotion={reducedMotion}
          labelVisible={!selected}
          groupRef={coreRef}
        />
        <LiveLines />
        {UNIVERSE_NODES.map((def) => (
          <UniverseNode
            key={def.id}
            def={def}
            selectedId={selected?.id ?? null}
            onHover={onHover}
            onSelect={onSelect}
            reducedMotion={reducedMotion}
            coreRef={coreRef}
          />
        ))}
      </Rig>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={5}
        maxDistance={11}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        enabled={!selected}
      />
      <CameraTransition selected={selected} onArrive={onNavigate} />
    </>
  );
}

export function UniverseCanvas(props: UniverseCanvasProps) {
  return (
    <Canvas
      dpr={props.quality.dpr}
      camera={{ position: CAMERA_HOME_POSITION, fov: CAMERA_FOV }}
      frameloop={props.reducedMotion ? "demand" : "always"}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
    >
      {/* Transparent (alpha) so the page bg token shows through — no color attach. */}
      <UniverseScene {...props} />
    </Canvas>
  );
}
