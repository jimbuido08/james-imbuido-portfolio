/**
 * The one text-field style, composed from segments so the variants (labelled
 * auth/contact fields vs the borderless chat input) stay one edit apart
 * instead of drifting apart.
 */
const base =
  "w-full rounded-md border border-border px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

/** A labelled form field (login, signup, contact). */
export const fieldClasses = `mt-2 ${base} bg-surface`;

/** The chat input: no top margin, sunken surface, no manual resize handle. */
export const chatFieldClasses = `resize-none ${base} bg-surface-2`;
