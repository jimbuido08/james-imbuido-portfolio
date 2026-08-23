import type { ComponentProps } from "react";

import { cx } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & {
  /** Adds a subtle hover affordance for interactive/linked cards. */
  interactive?: boolean;
};

export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-lg border border-border bg-surface p-6",
        interactive && "transition-colors hover:border-border-strong",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("space-y-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cx("text-xl font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cx("text-sm leading-relaxed text-fg-muted", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mt-4", className)} {...props} />;
}
