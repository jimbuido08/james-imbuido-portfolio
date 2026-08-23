type HeadingLevel = "h1" | "h2" | "h3";

const headingClasses: Record<HeadingLevel, string> = {
  h1: "text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl",
  h2: "text-2xl font-semibold tracking-tight sm:text-3xl",
  h3: "text-xl font-semibold tracking-tight",
};

export function SectionHeading({
  kicker,
  title,
  description,
  as = "h2",
  className,
}: {
  /** Eyebrow/kicker label — mono, uppercase, letter-spaced. */
  kicker?: string;
  title: string;
  description?: string;
  as?: HeadingLevel;
  className?: string;
}) {
  const Heading = as;

  return (
    <div className={className}>
      {kicker && (
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-fg-subtle">
          {kicker}
        </p>
      )}
      <Heading className={headingClasses[as]}>{title}</Heading>
      {description && (
        <p className="mt-3 max-w-prose text-base leading-relaxed text-fg-muted">
          {description}
        </p>
      )}
    </div>
  );
}
