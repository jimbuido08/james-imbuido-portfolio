/**
 * Only in-app relative paths are acceptable post-auth destinations — same
 * guard as app/auth/confirm/route.ts (no open redirect). Defaults to /account.
 *
 * Plain module (no "use server") so it can be imported by server pages and
 * action modules alike without Next treating it as an async server action.
 */
export function safeNext(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
}
