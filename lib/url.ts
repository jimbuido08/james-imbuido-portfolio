/**
 * The single owner of the internal/external URL rule — render sites branch on
 * this instead of repeating a `startsWith` check, the way lib/content/trust.ts
 * is the single owner of "is this placeholder copy?".
 *
 * Plain module (no server-only imports) — safe for client components and the
 * server loaders alike.
 */

/** Internal iff the value is a site-relative path — "/jtb", never "//cdn…" or an absolute origin. */
export function isInternalUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}
