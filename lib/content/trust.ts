/**
 * Content-trust rules — the single owner of "is this a placeholder?". The rule
 * was previously scattered across the markdown loaders and render sites; this
 * module is the one place it lives, so a placeholder can never be grounded as
 * fact.
 *
 * Plain module (no server-only imports) — safe for client components and the
 * server loaders alike.
 */

/** A value is placeholder copy if it carries the TODO marker. */
export function isPlaceholder(value: string): boolean {
  return value.includes("TODO");
}
