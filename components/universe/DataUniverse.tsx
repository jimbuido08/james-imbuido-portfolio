"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEnvironmentCapabilities } from "@/lib/universe/capabilities";
import type { UniverseNodeDef } from "@/lib/universe/config";

import { UniverseFallback } from "./UniverseFallback";
import { UniverseOverlay } from "./UniverseOverlay";

// ssr:false is only legal inside a Client Component (lazy-loading.md). This is
// the ONLY next/dynamic call site: three/@react-three/* land in a lazy chunk,
// never the route's main bundle.
const UniverseCanvas = dynamic(
  () => import("./UniverseCanvas").then((m) => m.UniverseCanvas),
  { ssr: false },
);

/**
 * Top-level client boundary for the Data Universe. Owns hover/selected state;
 * every browser-environment fact (hydration, WebGL, reduced motion, mobile
 * quality) comes from useEnvironmentCapabilities. DOM↔canvas interplay goes
 * through callback props only — React context (useRouter) does not reliably
 * cross the R3F renderer boundary.
 */
export function DataUniverse() {
  const router = useRouter();
  const [hovered, setHovered] = useState<UniverseNodeDef | null>(null);
  const [selected, setSelected] = useState<UniverseNodeDef | null>(null);
  const { showCanvas, reducedMotion, quality } = useEnvironmentCapabilities();

  const handleSelect = (node: UniverseNodeDef) => {
    setSelected(node);
    // Reduced motion: no camera transit — navigate immediately (§18).
    if (reducedMotion) {
      router.push(node.route);
    }
  };

  // §11.1 fallback path: until a live canvas exists (server render, hydration,
  // no JavaScript, or no WebGL) the wrapper shows the server-rendered section
  // link list — the fallback renders in the initial HTML, then upgrades to the
  // canvas once mounted. The div below is always rendered so server and client
  // agree on the tree.
  return (
    <>
      {!showCanvas && <UniverseFallback />}
      <div className="relative h-full w-full" aria-hidden="true">
        {showCanvas && (
          <UniverseCanvas
            quality={quality}
            reducedMotion={reducedMotion}
            selected={selected}
            onHover={setHovered}
            onSelect={handleSelect}
            onNavigate={(route) => router.push(route)}
          />
        )}
        <UniverseOverlay
          hovered={hovered}
          selected={selected}
          reducedMotion={reducedMotion}
          showHint={showCanvas}
        />
      </div>
    </>
  );
}
