"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isSameRouteSatellite, QUALITY } from "@/lib/universe/config";
import type { UniverseNodeDef } from "@/lib/universe/config";
import { supportsWebGL } from "@/lib/universe/webgl";

import { UniverseOverlay } from "./UniverseOverlay";

// ssr:false is only legal inside a Client Component (lazy-loading.md). This is
// the ONLY next/dynamic call site: three/@react-three/* land in a lazy chunk,
// never the route's main bundle.
const UniverseCanvas = dynamic(
  () => import("./UniverseCanvas").then((m) => m.UniverseCanvas),
  { ssr: false },
);

/**
 * Top-level client boundary for the Data Universe. Owns hover/selected state
 * and the WebGL gate. DOM↔canvas interplay goes through callback props only —
 * React context (useRouter) does not reliably cross the R3F renderer boundary.
 */
export function DataUniverse() {
  const router = useRouter();
  const [hovered, setHovered] = useState<UniverseNodeDef | null>(null);
  const [selected, setSelected] = useState<UniverseNodeDef | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Initialize false on SSR; the probe only runs in the browser.
  const [webgl] = useState(() => supportsWebGL());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // §11.1 fallback path: no WebGL → render nothing. The header nav and the
  // SSR'd index grid below already provide full content and navigation.
  if (!webgl) return null;

  const quality = isMobile ? QUALITY.mobile : QUALITY.desktop;

  const handleHover = (node: UniverseNodeDef | null) => setHovered(node);

  const handleSelect = (node: UniverseNodeDef) => {
    // Same-route satellites (all AI/ML categories route to /ai-ml, like their
    // parent) skip the camera glide — it would animate to a destination the
    // camera is already pointed at — and navigate directly (§11.2).
    if (isSameRouteSatellite(node)) {
      router.push(node.route);
      return;
    }
    setSelected(node);
    // Reduced motion: no camera transit — navigate immediately (§18).
    if (reducedMotion) {
      router.push(node.route);
    }
  };

  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <UniverseCanvas
        quality={quality}
        reducedMotion={reducedMotion}
        selected={selected}
        onHover={handleHover}
        onSelect={handleSelect}
        onNavigate={(route) => router.push(route)}
      />
      <UniverseOverlay
        hovered={hovered}
        selected={selected}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
