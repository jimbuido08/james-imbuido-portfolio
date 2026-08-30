import type { ReactNode } from "react";

import { cx } from "@/lib/utils";

/**
 * The one body-copy style: measured width, relaxed leading, muted colour.
 * Takes string children (paragraph text with "\n\n" breaks become separate
 * paragraphs via `Prose.Text`) or arbitrary block children.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "max-w-prose text-base leading-relaxed text-fg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One paragraph of body copy at the Prose style. */
export function ProseParagraph({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "max-w-prose text-base leading-relaxed text-fg-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A multi-paragraph block: splits on blank lines, the markdown-ish convention
 * the case-study fields use.
 */
export function ProseParagraphs({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <>
      {text.split("\n\n").map((paragraph, index) => (
        <ProseParagraph key={index} className={className}>
          {paragraph}
        </ProseParagraph>
      ))}
    </>
  );
}
