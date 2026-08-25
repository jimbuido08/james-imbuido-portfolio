/**
 * Content-trust rules — the single owner of "is this a placeholder?" and
 * "may this embed URL be loaded?". Both rules were previously scattered across
 * the markdown loaders and five render sites; this module is the one place they
 * live, so a placeholder can never be grounded as fact and a vendor embed can
 * never load from an unvetted host.
 *
 * Plain module (no server-only imports) — safe for client components and the
 * server loaders alike.
 */

/** A value is placeholder copy if it carries the TODO marker. */
export function isPlaceholder(value: string): boolean {
  return value.includes("TODO");
}

/** Vendor hosts allowed to serve dashboard embeds, keyed by embedType. */
const EMBED_ALLOWLIST: Record<string, (host: string) => boolean> = {
  tableau: (h) => h === "public.tableau.com" || h.endsWith(".tableau.com"),
  power_bi: (h) => h === "app.powerbi.com",
};

/**
 * True when url is a real (non-placeholder) https URL on the vendor host for
 * embedType. Unknown embedType → false: no embed is trusted by default, so a
 * typo'd embedType can never silently widen the boundary.
 */
export function isAllowedEmbedUrl(
  embedType: string | undefined,
  url: string,
): boolean {
  const allowed = embedType ? EMBED_ALLOWLIST[embedType] : undefined;
  if (!allowed) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && allowed(parsed.hostname);
}
