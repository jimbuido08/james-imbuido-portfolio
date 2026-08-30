import * as THREE from "three";

/**
 * Live node positions in world space — the contract between the node meshes
 * and whatever else needs their true center:
 *
 *  - Write: each `UniverseNode` registers one persistent Vector3 under its node
 *    id, and refreshes it in `useFrame` (after the `Float` drift has moved the
 *    mesh). Mutated in place, never reallocated per frame. Unregistered on
 *    unmount.
 *  - Read: `LiveLines` glues connection-line endpoints to these positions
 *    rather than the static rest positions in config — a static line would
 *    visibly miss the drifting node center.
 *
 * Keyed by node id (never array index) so renderer-side bookkeeping cannot
 * desync from the registry order.
 */
export const nodePositions = new Map<string, THREE.Vector3>();
