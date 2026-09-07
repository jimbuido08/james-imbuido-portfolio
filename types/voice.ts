/**
 * Shared voice-claim vocabulary. The reward request body is empty by design —
 * synthesis runs entirely in the visitor's browser (device-only guardrail),
 * so the server has nothing to verify beyond auth, once-per-user, and the
 * rate limit. UI, lib/voice/claim.ts, and the route adapter all use these.
 */

export type VoiceClaimErrorCode =
  | "unauthenticated"
  | "already_claimed"
  | "rate_limited"
  | "internal";

export interface VoiceClaimError {
  error: {
    code: VoiceClaimErrorCode;
    message: string;
  };
  creditsRemaining?: number;
}

export interface VoiceClaimSuccess {
  ok: true;
  creditsAwarded: number;
  creditsRemaining: number;
}

/** Shape of the claim_voice_reward RPC's jsonb return — mirrors
 * ClaimChessRewardResult. rateLimited (with claimed=false) is the RPC's
 * authoritative rate gate refusing the caller; claimed=false without it is
 * the once-per-user gate. */
export interface ClaimVoiceRewardResult {
  claimed: boolean;
  creditsRemaining: number | null;
  rateLimited?: boolean;
}