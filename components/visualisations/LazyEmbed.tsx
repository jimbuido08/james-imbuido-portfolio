"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

type LoadState = "poster" | "loading" | "ready";

const VENDOR_LABEL: Record<string, string> = {
  tableau: "Tableau Public",
  power_bi: "Power BI",
};

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/**
 * Click-to-load third-party dashboard iframe (§17: embeds never load until
 * asked for). Tableau share URLs get the standard embed params; Power BI
 * publish-to-web URLs are used verbatim. The vendor host is already pinned by
 * the frontmatter allowlist in lib/content/projects.ts — no sandbox here
 * (interactive dashboards need vendor scripts); the allowlist is the boundary.
 */
export function LazyEmbed({
  embedType,
  embedUrl,
  title,
  previewImage,
}: {
  embedType: "tableau" | "power_bi";
  embedUrl: string;
  title: string;
  previewImage?: string;
}) {
  const [state, setState] = useState<LoadState>("poster");
  const [showSlowHint, setShowSlowHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vendor = VENDOR_LABEL[embedType] ?? "dashboard provider";
  const src =
    embedType === "tableau" && !embedUrl.includes("?")
      ? `${embedUrl}?:showVizHome=no&:embed=true&:tabs=yes`
      : embedUrl;

  useEffect(() => {
    if (state !== "loading") return;
    // Cross-origin iframes fire onLoad even on vendor error pages and give no
    // error signal we can read — so the slow-hint is the only honest affordance.
    timerRef.current = setTimeout(() => setShowSlowHint(true), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  return (
    <div className="mt-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-2">
        {state === "poster" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {previewImage && (
              <Image
                src={previewImage}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 896px"
                className="object-cover opacity-40"
              />
            )}
            <p className="relative font-mono text-xs uppercase tracking-widest text-fg-subtle">
              Interactive {vendor} dashboard
            </p>
            <div className="relative">
              <Button size="sm" onClick={() => setState("loading")}>
                Load interactive dashboard
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            title={title}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setState("ready")}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
      <p className="mt-3 text-sm text-fg-subtle">
        {showSlowHint && state !== "ready"
          ? "Taking too long? "
          : "Prefer full-screen? "}
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClasses}
        >
          Open in {vendor} ↗
        </a>
      </p>
    </div>
  );
}
