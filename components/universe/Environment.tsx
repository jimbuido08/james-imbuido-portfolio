"use client";

import { UNIVERSE_COLORS } from "@/lib/universe/config";

/** Restrained lighting — no HDR/environment loader this phase. */
export function Environment() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 6, 4]}
        intensity={0.7}
        color={UNIVERSE_COLORS.fg}
      />
      <directionalLight
        position={[-5, -2, -4]}
        intensity={0.15}
        color={UNIVERSE_COLORS.fgMuted}
      />
    </>
  );
}
