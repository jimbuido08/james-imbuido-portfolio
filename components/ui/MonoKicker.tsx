import type { ComponentProps } from "react";

import { cx } from "@/lib/utils";

/**
 * The mono uppercase eyebrow label — the kickers retyped across the chess,
 * contact, and project screens. Not SectionHeading's kicker (that one tracks
 * wider under a heading); this is the standalone form. Standalone means it can
 * also serve as an aria-live status line, so ordinary <p> props pass through.
 */
export function MonoKicker({
  children,
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cx(
        "font-mono text-xs uppercase tracking-widest text-fg-subtle",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
