import { cx } from "@/lib/utils";

export function CreditsBadge({ credits }: { credits: number }) {
  const low = credits <= 3;
  return (
    <span
      className={cx(
        "font-mono text-sm",
        low ? "text-accent-jtb" : "text-fg-muted",
      )}
    >
      {credits} interaction{credits === 1 ? "" : "s"} left
    </span>
  );
}
