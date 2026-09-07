/**
 * The voice reward claim — the /voice half of the credits economy as one
 * decision core, mirroring lib/chess/claim.ts minus the replay: synthesis
 * runs entirely in the visitor's browser, so the request carries an empty
 * body and there is nothing to verify server-side. The server's authority is
 * auth + once-per-user (the unique constraint inside claim_voice_reward) +
 * the rate gate baked into that RPC. Only the Supabase reads/RPC/attempt
 * rows enter through injected deps, so every branch is exercisable through
 * this interface. Never import from client components.
 */
import { INTERNAL_SERVER_MESSAGE } from "@/lib/api/messages";
import { rateWindowStart } from "@/lib/ratelimit/window";
import type { OutcomeView } from "@/lib/server/http";

import type {
  ClaimVoiceRewardResult,
  VoiceClaimErrorCode,
} from "@/types/voice";
import type { JsonObject } from "@/types/json";

/** Rate limit: at most this many claim attempts per user per window. */
export const RATE_LIMIT_MAX_ATTEMPTS = 10;
/** Rate-limit window in milliseconds, counted from voice_claim_attempts. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface VoiceClaimDeps {
  /**
   * Caller's claim flag + balance. The pre-check exists for clean 409 UX; the
   * authoritative once-per-user gate is the unique constraint inside
   * claim_voice_reward.
   */
  getProfile(): Promise<
    | { ok: true; voiceRewardClaimed: boolean; creditsRemaining: number }
    | { ok: false }
  >;
  /** Count of the caller's recorded claim attempts in the trailing window. */
  countRecentAttempts(
    windowStartIso: string,
  ): Promise<{ ok: true; count: number } | { ok: false }>;
  /**
   * Meter one claim attempt — best-effort, so a dropped write never denies a
   * claim. Written for every attempt that passes the rate-limit check.
   */
  recordAttempt(): Promise<void>;
  /** The atomic award RPC. result null/malformed = unexpected DB response. */
  claimReward(
    metadata: JsonObject,
  ): Promise<
    { ok: true; result: ClaimVoiceRewardResult | null } | { ok: false }
  >;
}

export type VoiceClaimOutcome =
  | { kind: "ok"; creditsRemaining: number }
  | { kind: "already_claimed"; creditsRemaining?: number }
  | { kind: "rate_limited" }
  | { kind: "internal"; detail: string };

/**
 * The outcome → HTTP table for the voice route: the wire half of the outcome
 * vocabulary. "ok" and its success body stay in the route adapter. Internal
 * details never reach the wire — they stay on the outcome for the route to
 * log.
 */
export function describeOutcome(
  outcome: Exclude<VoiceClaimOutcome, { kind: "ok" }>,
): OutcomeView<VoiceClaimErrorCode> {
  switch (outcome.kind) {
    case "already_claimed":
      return {
        status: 409,
        code: "already_claimed",
        message: "You've already claimed the voice reward.",
        ...(outcome.creditsRemaining !== undefined
          ? { creditsRemaining: outcome.creditsRemaining }
          : {}),
      };
    case "rate_limited":
      return {
        status: 429,
        code: "rate_limited",
        message: "Too many claim attempts — please wait a moment.",
        retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000,
      };
    case "internal":
      return {
        status: 500,
        code: "internal",
        message: INTERNAL_SERVER_MESSAGE,
      };
  }
}

export async function claimVoiceReward(
  deps: VoiceClaimDeps,
  /** Clock injected so the rate-limit window is decidable without wall time. */
  nowMs: number,
): Promise<VoiceClaimOutcome> {
  // Claimed pre-check — cheap UX gate; not the authority.
  const profile = await deps.getProfile();
  if (!profile.ok) return { kind: "internal", detail: "profiles read failed" };
  if (profile.voiceRewardClaimed) {
    return {
      kind: "already_claimed",
      creditsRemaining: profile.creditsRemaining,
    };
  }

  // Rate limit — bounds hammering the RPC, not the reward itself (it is
  // once-per-user). The RPC re-checks authoritatively.
  const windowStart = rateWindowStart(nowMs, RATE_LIMIT_WINDOW_MS);
  const attempts = await deps.countRecentAttempts(windowStart);
  if (!attempts.ok)
    return { kind: "internal", detail: "rate-limit count failed" };
  if (attempts.count >= RATE_LIMIT_MAX_ATTEMPTS)
    return { kind: "rate_limited" };
  await deps.recordAttempt();

  // Atomic award — the unique(user_id, reward_type) constraint inside the RPC
  // makes it once-per-user; +2 and voice_reward_claimed flip in one
  // transaction. No verification stage: the request is empty by design.
  const award = await deps.claimReward({ source: "voice-studio" });
  if (!award.ok)
    return { kind: "internal", detail: "claim_voice_reward rpc failed" };

  const result = award.result;
  if (!result || typeof result.claimed !== "boolean") {
    return {
      kind: "internal",
      detail: "claim_voice_reward returned unexpected shape",
    };
  }
  if (!result.claimed) {
    // The RPC's authoritative rate gate refused (the pre-check race was lost
    // or the RPC was called around the route): treat as rate_limited.
    if (result.rateLimited) return { kind: "rate_limited" };
    // Lost the pre-check race: a concurrent request claimed first.
    return { kind: "already_claimed" };
  }
  if (typeof result.creditsRemaining !== "number") {
    return { kind: "internal", detail: "claimed but no balance returned" };
  }
  return { kind: "ok", creditsRemaining: result.creditsRemaining };
}