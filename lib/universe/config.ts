// Palette mirrors app/globals.css @theme tokens. Three.js canvases cannot read
// CSS custom properties, so this file is the single allowed location for hexes.

export type UniverseDomain =
  | "ai"
  | "data"
  | "jtb"
  | "chess"
  | "about"
  | "experience"
  | "neutral";

export interface UniverseNodeDef {
  id: string; // "about"
  label: string; // "About"
  // Shorter display name for the always-visible label, matching the header
  // nav. Used where the full label is too wide to sit centered under the
  // node without colliding with a neighbouring label.
  shortLabel?: string;
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
  border: "#26262c", // --color-border (wireframe, connection lines)
  borderStrong: "#3a3a42", // --color-border-strong
  fgSubtle: "#71717a", // --color-fg-subtle (particles)
} as const;

export const ORBIT_RADIUS = 3.2;

// Precomputed: ORBIT_RADIUS ring on XZ plane, alternating y offsets
// ±[0.4, -0.35, 0.3, -0.4, 0.45, -0.3]; x = r·cosθ, z = r·sinθ, θ = i·60°.
export const UNIVERSE_NODES: UniverseNodeDef[] = [
  {
    id: "about",
    label: "About",
    route: "/about",
    domain: "about",
    accent: "#60a5fa",
    blurb: "Who James is — background and approach.",
    position: [3.2, 0.4, 0],
  },
  {
    id: "experience",
    label: "Experience",
    route: "/experience",
    domain: "experience",
    accent: "#d98c96",
    blurb: "Professional data science experience.",
    position: [1.6, -0.35, 2.771],
  },
  {
    id: "ai-ml",
    label: "AI / Machine Learning",
    shortLabel: "AI/ML",
    route: "/ai-ml",
    domain: "ai",
    accent: "#818cf8",
    blurb: "Machine learning and AI projects.",
    position: [-1.6, 0.3, 2.771],
  },
  {
    id: "data",
    label: "Data Visualisation",
    shortLabel: "Data Viz",
    route: "/data",
    domain: "data",
    accent: "#2dd4bf",
    blurb: "Dashboards and custom visualisations.",
    position: [-3.2, -0.4, 0],
  },
  {
    id: "jtb",
    label: "JTB",
    route: "/jtb",
    domain: "jtb",
    accent: "#d9a03f",
    blurb: "JTB — ask questions about James's work.",
    position: [-1.6, 0.45, -2.771],
  },
  {
    id: "chess",
    label: "Chess AI",
    route: "/chess",
    domain: "chess",
    accent: "#4da37e",
    blurb: "Play against James's chess model.",
    position: [1.6, -0.3, -2.771],
  },
];

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
