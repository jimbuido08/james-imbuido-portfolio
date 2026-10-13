import { createRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";

import { UNIVERSE_NODES } from "@/lib/universe/config";

/**
 * Live handles on every node's sphere mesh — the contract between the node
 * meshes and the label occlusion test:
 *
 *  - Write: each `UniverseNode` attaches its own sphere to the ref for its id.
 *  - Read: `UniverseNode` hands the refs of the *other* nodes to drei's `<Html
 *    occlude>`, so an always-on label can never paint over a sphere in front of
 *    it. Labels are DOM siblings stacked above the canvas, so without this a
 *    distant node's name shows straight through the sphere covering it.
 *
 * A node's own ref is deliberately never in its own occlude list: the label
 * rides 0.5 units below the node center, and past ~60° of camera elevation that
 * offset projects inside its own sphere's silhouette — self-occlusion would
 * blank a node's own label exactly when the user tilts the view.
 *
 * Refs are created at module load rather than during render, so every node can
 * look up its siblings on the first render — before any of them has mounted.
 */
const refs = new Map<string, RefObject<THREE.Mesh | null>>(
  UNIVERSE_NODES.map((node) => [node.id, createRef<THREE.Mesh>()]),
);

function refFor(id: string): RefObject<THREE.Mesh | null> {
  const ref = refs.get(id);
  if (!ref) {
    throw new Error(`Universe node "${id}" has no occluder ref`);
  }
  return ref;
}

/** The node's own sphere mesh — tracked for its live world position. */
export function nodeMeshRef(id: string): RefObject<THREE.Mesh | null> {
  return refFor(id);
}

/** Every other node's sphere — what one node's label must never paint over. */
export function nodeSiblingRefs(id: string): RefObject<THREE.Mesh | null>[] {
  return UNIVERSE_NODES.filter((node) => node.id !== id).map((node) =>
    refFor(node.id),
  );
}
