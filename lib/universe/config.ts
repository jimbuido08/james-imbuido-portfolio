// Palette mirrors app/globals.css @theme tokens. Three.js canvases cannot read
// CSS custom properties, so this file is the single allowed location for hexes.

import { NAV_ITEMS } from "@/lib/navigation";

/**
 * Route strings come from the single navigation registry (lib/navigation.ts).
 * A node id with no matching route is a programming error — throw at module
 * load so the build fails instead of silently drifting from the header.
 */
const navHref = (id: string): string => {
  const item = NAV_ITEMS.find((n) => n.href === `/${id}`);
  if (!item) {
    throw new Error(`Universe node "${id}" has no route in lib/navigation.ts`);
  }
  return item.href;
};

export type UniverseDomain =
  "ai" | "jtb" | "chess" | "voice" | "about" | "experience" | "neutral";

export interface UniverseNodeDef {
  id: string; // "about"
  label: string; // "About"
  route: string; // "/about"
  domain: UniverseDomain;
  accent: string; // hex, mirror of the domain accent token
  blurb: string; // one-line hover description, no fabricated facts
  position: [number, number, number];
}

export const UNIVERSE_COLORS = {
  bg: "#0a0a0b", // --color-bg (also fog color)
  fg: "#f4f4f5", // --color-fg (key/rim light)
  fgMuted: "#a1a1aa", // --color-fg-muted (fill light)
  surface2: "#1a1a1f", // --color-surface-2 (core body)
  accentAi: "#818cf8", // --color-accent-ai (core emissive)
  accentVoice: "#5aa3b8", // --color-accent-voice
  border: "#26262c", // --color-border (wireframe, connection lines)
  borderStrong: "#3a3a42", // --color-border-strong
  fgSubtle: "#71717a", // --color-fg-subtle (particles)
} as const;

// Positions are precomputed, not derived at runtime. Nodes sit exactly 45°
// apart on the XZ plane (θ = i·(360°/8) for i = 0..7) but each has its own
// orbital radius (2.7–3.9) and elevation (−0.7 to 0.95), so the constellation
// feels organic rather than a rigid ring: x = r·cosθ, z = r·sinθ.
export const UNIVERSE_NODES: UniverseNodeDef[] = [
  {
    id: "about",
    label: "About",
    route: navHref("about"),
    domain: "about",
    accent: "#60a5fa",
    blurb: "Who James is — background and approach.",
    position: [3.5, 0.9, 0], // r = 3.5, θ = 0° (8-node rebalance: unchanged)
  },
  {
    id: "experience",
    label: "Experience",
    route: navHref("experience"),
    domain: "experience",
    accent: "#d98c96",
    blurb: "Professional data science experience.",
    position: [1.909, -0.7, 1.909], // r = 2.7, θ = 45°
  },
  {
    id: "ai-ml",
    label: "AI Projects",
    route: navHref("ai-ml"),
    domain: "ai",
    accent: "#818cf8",
    blurb: "Machine learning and AI projects.",
    position: [0, 0.45, 3.9], // r = 3.9, θ = 90°
  },
  {
    id: "jtb",
    label: "JTB",
    route: navHref("jtb"),
    domain: "jtb",
    accent: "#d9a03f",
    blurb: "JTB — ask questions about James's work.",
    position: [-2.616, 0.95, 2.616], // r = 3.7, θ = 135°
  },
  {
    id: "chess",
    label: "Chess AI",
    route: navHref("chess"),
    domain: "chess",
    accent: "#4da37e",
    blurb: "Play against James's chess model.",
    position: [-3.1, -0.35, 0], // r = 3.1, θ = 180°
  },
  {
    id: "voice",
    label: "Voice Cloning",
    route: navHref("voice"),
    domain: "voice",
    accent: "#5aa3b8",
    blurb: "Clone a voice in your browser — audio never leaves the device.",
    position: [-2.333, -0.5, -2.333], // r = 3.3, θ = 225°
  },
  {
    id: "llm-lab",
    label: "LLM Lab",
    route: navHref("llm-lab"),
    domain: "ai",
    accent: "#a78bfa",
    blurb: "Train a tiny LLM in your browser — nothing leaves the device.",
    position: [0, 0.2, -3.4], // r = 3.4, θ = 270°
  },
  {
    id: "storyteller",
    label: "Storyteller",
    route: navHref("storyteller"),
    domain: "ai",
    accent: "#d4a24f", // per-node hex precedent (llm-lab violet has no CSS token)
    blurb: "James's from-scratch GPT writes a story in your browser.",
    position: [2.687, -0.15, -2.687], // r = 3.8, θ = 315°
  },
];

// --- Registry integrity (module load) --------------------------------------
// A broken node graph must fail the build, not render a half-missing scene:
// node ids are unique across the constellation.
const nodeIds = new Set<string>();
for (const node of UNIVERSE_NODES) {
  if (nodeIds.has(node.id)) {
    throw new Error(`Duplicate universe node id "${node.id}"`);
  }
  nodeIds.add(node.id);
}

export interface QualityProfile {
  particles: number;
  dpr: [number, number];
  sparkles: number;
}

// Typed as QualityProfile (not `as const`) so `dpr` stays a mutable
// [number, number] tuple — what @react-three/fiber's Canvas `dpr` prop accepts.
export const QUALITY: Record<"desktop" | "mobile", QualityProfile> = {
  desktop: { particles: 1200, dpr: [1, 2], sparkles: 80 },
  mobile: { particles: 400, dpr: [1, 1.5], sparkles: 30 },
};

export const CAMERA_HOME_POSITION: [number, number, number] = [0, 1.2, 7.5];
export const CAMERA_FOV = 45;
export const NODE_RADIUS = 0.18;
export const APPROACH_DISTANCE = 1.2; // camera stops this far from the node on select
