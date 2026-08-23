import type { ReactNode } from "react";

import { cx } from "@/lib/utils";

export type TagDomain =
  | "ai"
  | "data"
  | "jtb"
  | "chess"
  | "about"
  | "experience"
  | "neutral";

const domainClasses: Record<TagDomain, string> = {
  ai: "text-accent-ai border-accent-ai/40",
  data: "text-accent-data border-accent-data/40",
  jtb: "text-accent-jtb border-accent-jtb/40",
  chess: "text-accent-chess border-accent-chess/40",
  about: "text-accent-about border-accent-about/40",
  experience: "text-accent-exp border-accent-exp/40",
  neutral: "text-accent-neut border-accent-neut/40",
};

/** Small outline domain badge — accent is an identity marker, not decoration. */
export function Tag({
  domain,
  className,
  children,
}: {
  domain: TagDomain;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
        domainClasses[domain],
        className,
      )}
    >
      {children}
    </span>
  );
}
