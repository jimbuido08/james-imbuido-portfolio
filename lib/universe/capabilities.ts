import { useEffect, useState, useSyncExternalStore } from "react";

import { QUALITY } from "./config";
import type { QualityProfile } from "./config";
import { supportsWebGL } from "./webgl";

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true after — the general shape for
 * browser-only facts. The subscribe never fires; the snapshots just encode
 * "not hydrated yet" vs "hydrated", so anything gated on it renders identical
 * server HTML and first-client render (no hydration mismatch), then upgrades.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/**
 * Every browser-environment fact the universe needs, in one hook:
 * hydration state, WebGL support, reduced motion, mobile, and the quality
 * profile those imply. DataUniverse was previously a wall of four effects and
 * two probes — the explanation of why each gate exists lives here, written
 * once. The canvas renders when `showCanvas` is true; until then (server
 * render, hydration, or never — no WebGL) callers show the fallback content.
 */
export function useEnvironmentCapabilities(): {
  mounted: boolean;
  webgl: boolean;
  showCanvas: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
  quality: QualityProfile;
} {
  const mounted = useMounted();
  // WebGL probe: false on the server (never even reaches the DOM there), read
  // once on the client. Combined with `mounted` it cannot cause a hydration
  // mismatch — anything WebGL-dependent also waits for `showCanvas`.
  const [webgl] = useState(() => supportsWebGL());
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const quality = isMobile ? QUALITY.mobile : QUALITY.desktop;
  return {
    mounted,
    webgl,
    showCanvas: mounted && webgl,
    reducedMotion,
    isMobile,
    quality,
  };
}
