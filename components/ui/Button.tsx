import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cx } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  // Inverted, high-contrast — deliberately NOT an accent color.
  primary: "bg-fg text-bg hover:bg-fg/90",
  secondary:
    "border border-border bg-transparent hover:border-border-strong hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When provided, renders a `next/link` Link instead of a `<button>`. */
  href?: string;
  className?: string;
  children: ReactNode;
} & ComponentProps<"button">;

export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cx(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
