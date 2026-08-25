import * as THREE from "three";

/**
 * Live node positions in world space, written by each `UniverseNode` in its
 * `useFrame` (after the `Float` drift has transformed it) and read by
 * `LiveLines` to keep line endpoints glued to the actual node centers rather
 * than their static rest positions (config `position`). One persistent Vector3
 * per node id — mutated in place, never reallocated per frame.
 */
export const nodePositions = new Map<string, THREE.Vector3>();
