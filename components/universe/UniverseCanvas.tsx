"use client";

import { Canvas } from "@react-three/fiber";

import { CAMERA_FOV, CAMERA_HOME_POSITION } from "@/lib/universe/config";
import type { QualityProfile, UniverseNodeDef } from "@/lib/universe/config";

import { UniverseScene } from "./UniverseScene";

type UniverseCanvasProps = {
  quality: QualityProfile;
  reducedMotion: boolean;
  selected: UniverseNodeDef | null;
  onHover: (node: UniverseNodeDef | null) => void;
  onSelect: (node: UniverseNodeDef) => void;
  onNavigate: (route: string) => void;
};

export function UniverseCanvas({
  quality,
  reducedMotion,
  selected,
  onHover,
  onSelect,
  onNavigate,
}: UniverseCanvasProps) {
  return (
    <Canvas
      dpr={quality.dpr}
      camera={{ position: CAMERA_HOME_POSITION, fov: CAMERA_FOV }}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
    >
      {/* Transparent (alpha) so the page bg token shows through — no color attach. */}
      <UniverseScene
        quality={quality}
        reducedMotion={reducedMotion}
        selected={selected}
        onHover={onHover}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />
    </Canvas>
  );
}
