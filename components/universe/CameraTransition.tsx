"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";

import { APPROACH_DISTANCE } from "@/lib/universe/config";
import type { UniverseNodeDef } from "@/lib/universe/config";

type CameraTransitionProps = {
  selected: UniverseNodeDef | null;
  onArrive: (route: string) => void;
};

/**
 * When a node is selected, glide the camera to a point APPROACH_DISTANCE in
 * front of the node, then call onArrive exactly once.
 *
 * Reduced-motion path never sets `selected` without also skipping the transit
 * (DataUniverse navigates immediately), so no special-casing is needed here.
 */
export function CameraTransition({
  selected,
  onArrive,
}: CameraTransitionProps) {
  const target = useRef<Vector3 | null>(null);
  const lookAt = useRef(new Vector3(0, 0, 0));
  const fired = useRef(false);

  useFrame((state, delta) => {
    if (!selected) {
      target.current = null;
      fired.current = false;
      return;
    }

    // First frame after selection: compute the approach point from wherever
    // the camera currently is.
    if (!target.current) {
      const nodePos = new Vector3(...selected.position);
      const dir = nodePos.clone().sub(state.camera.position).normalize();
      target.current = nodePos
        .clone()
        .add(dir.clone().multiplyScalar(-APPROACH_DISTANCE));
      lookAt.current.copy(nodePos);
      fired.current = false;
    }

    state.camera.position.lerp(target.current, 1 - Math.exp(-3 * delta));
    state.camera.lookAt(lookAt.current);

    if (
      state.camera.position.distanceTo(target.current) < 0.06 &&
      !fired.current
    ) {
      fired.current = true;
      onArrive(selected.route);
    }
  });

  return null;
}
