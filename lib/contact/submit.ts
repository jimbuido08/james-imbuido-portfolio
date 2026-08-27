/**
 * The contact submission — §22's policy as one decision core. No I/O: the
 * rate-limit count and the message insert both enter through injected deps,
 * so every branch — over the limit, lost the insert race, DB failure — is
 * exercisable through this interface. Never import from client components.
 */
import { RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS } from "./constants";
import type { ContactSubmitRequest } from "./types";

export interface ContactSubmitDeps {
  /**
   * Count of this client IP's messages in the trailing window. The pre-check
   * exists for clean 429 UX; the authoritative gate is the limit check inside
   * record_contact_message. A read failure is infrastructure trouble, not
   * "over the limit".
   */
  countRecentByIp(
    ipHash: string,
    windowStartIso: string,
  ): Promise<{ ok: true; count: number } | { ok: false }>;
  /**
   * The rate-checked insert RPC. recorded=false means the caller was over the
   * limit at insert time (the authoritative gate, or a lost pre-check race).
   */
  insertMessage(input: {
    name: string;
    email: string;
    message: string;
    ipHash: string;
  }): Promise<{ ok: true; recorded: boolean } | { ok: false }>;
}

export type ContactSubmitOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited" }
  | { kind: "internal"; detail: string };

export async function submitContactMessage(
  deps: ContactSubmitDeps,
  input: ContactSubmitRequest & { ipHash: string },
  /** Clock injected so the rate-limit window is decidable without wall time. */
  nowMs: number,
): Promise<ContactSubmitOutcome> {
  // Rate-limit pre-check — cheap UX gate; not the authority.
  const windowStart = new Date(
    nowMs - (RATE_LIMIT_WINDOW_MS + 1000),
  ).toISOString();
  const recent = await deps.countRecentByIp(input.ipHash, windowStart);
  if (!recent.ok) {
    return { kind: "internal", detail: "rate-limit count failed" };
  }
  if (recent.count >= RATE_LIMIT_MAX_MESSAGES) return { kind: "rate_limited" };

  // Insert — the RPC re-checks the limit in the same transaction, so callers
  // that bypass the route (public key) are still bounded.
  const recorded = await deps.insertMessage(input);
  if (!recorded.ok) {
    return { kind: "internal", detail: "record_contact_message rpc failed" };
  }
  if (!recorded.recorded) return { kind: "rate_limited" };
  return { kind: "ok" };
}
