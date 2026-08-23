import type { ComponentProps } from "react";

import { cx } from "@/lib/utils";

/** Editorial page container — not full-bleed. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
