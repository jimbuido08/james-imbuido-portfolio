/**
 * The chess reward claim — §3.7's policy as one decision core. Server-side
 * replay (via lib/chess/engine, deterministic local code) is called directly;
 * only the Supabase reads/RPC/attempt rows enter through injected deps, so every
 * branch — already claimed, rate limited, illegal game, not a win, lost claim
 * race — is exercisable through this interface. Never import from client
 * components.
 */
import { INTERNAL_SERVER_MESSAGE } from "@/lib/api/messages";
import { rateWindowStart } from "@/lib/ratelimit/window";
import type { OutcomeView } from "@/lib/server/http";

import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } from "./constants";
import { replayMoves } from "./engine";
import type {
  ChessClaimErrorCode,
  ChessClaimRequest,
  ClaimChessRewardResult,
} from "@/types/chess";
import type { JsonObject } from "@/types/json";

export interface ChessClaimDeps {
  /**
   * Caller's claim flag + balance. The pre-check exists for clean 409 UX; the
   * authoritative once-per-user gate is the unique constraint inside
   * claim_chess_reward. A read failure is infrastructure trouble, not "not
   * claimed".
   */
  getProfile(): Promise<
    | { ok: true; chessRewardClaimed: boolean; creditsRemaining: number }
    | { ok: false }
  >;
  /** Count of the caller's recorded claim attempts in the trailing window. */
  countRecentAttempts(
    windowStartIso: string,
  ): Promise<{ ok: true; count: number } | { ok: false }>;
  /**
   * Meter one claim attempt — best-effort, so a dropped write never denies a
   * claim. Written for every attempt that passes the rate-limit check (win or
   * not), so the limiter counts attempts rather than just successful claims.
   */
  recordAttempt(): Promise<void>;
  /** The atomic award RPC. result null/malformed = unexpected DB response. */
  claimReward(
    metadata: JsonObject,
  ): Promise<
    { ok: true; result: ClaimChessRewardResult | null } | { ok: false }
  >;
}

export type ChessClaimOutcome =
  | { kind: "ok"; creditsRemaining: number }
  | { kind: "already_claimed"; creditsRemaining?: number }
  | { kind: "rate_limited" }
  | { kind: "illegal_game"; atIndex: number }
  | { kind: "not_a_win" }
  | { kind: "internal"; detail: string };

/**
 * The outcome → HTTP table for the chess route: the wire half of the outcome
 * vocabulary, ruled out per outcome kind so a new branch must state its
 * status and message. "ok" and its success body stay in the route adapter.
 * Internal details never reach the wire — they stay on the outcome for the
 * route to log.
 */
export function describeOutcome(
  outcome: Exclude<ChessClaimOutcome, { kind: "ok" }>,
): OutcomeView<ChessClaimErrorCode> {
  switch (outcome.kind) {
    case "already_claimed":
      return {
        status: 409,
        code: "already_claimed",
        message: "You've already claimed the chess reward.",
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
    case "illegal_game":
      return {
        status: 422,
        code: "illegal_game",
        message: `Move ${outcome.atIndex + 1} is not legal — the game was rejected.`,
      };
    case "not_a_win":
      return {
        status: 422,
        code: "not_a_win",
        message: "Only a game you won by checkmate earns the reward.",
      };
    case "internal":
      return {
        status: 500,
        code: "internal",
        message: INTERNAL_SERVER_MESSAGE,
      };
  }
}

export async function claimChessReward(
  deps: ChessClaimDeps,
  claim: ChessClaimRequest,
  /** Clock injected so the rate-limit window is decidable without wall time. */
  nowMs: number,
): Promise<ChessClaimOutcome> {
  // Claimed pre-check — cheap UX gate; not the authority.
  const profile = await deps.getProfile();
  if (!profile.ok) return { kind: "internal", detail: "profiles read failed" };
  if (profile.chessRewardClaimed) {
    return {
      kind: "already_claimed",
      creditsRemaining: profile.creditsRemaining,
    };
  }

  // Rate limit — count of this caller's recorded attempts in the window. The
  // reward is once-per-user, so this bounds hammering the replay/DB, not the
  // reward itself.
  const windowStart = rateWindowStart(nowMs, RATE_LIMIT_WINDOW_MS);
  const attempts = await deps.countRecentAttempts(windowStart);
  if (!attempts.ok)
    return { kind: "internal", detail: "rate-limit count failed" };
  if (attempts.count >= RATE_LIMIT_MAX_ATTEMPTS)
    return { kind: "rate_limited" };
  await deps.recordAttempt();

  // Server-side replay — always from the standard initial position, so every
  // move must be legal and turns must alternate. Client-provided FENs and
  // result verdicts are never accepted (§3.7, §21).
  const replay = replayMoves(claim.moves);
  if (!replay.ok) return { kind: "illegal_game", atIndex: replay.atIndex };

  // Win verification — checkmate with the caller's side as winner. Draws,
  // losses, and unfinished games earn nothing.
  const status = replay.engine.status();
  if (
    status.kind !== "over" ||
    status.reason !== "checkmate" ||
    status.winner !== claim.playerColor
  ) {
    return { kind: "not_a_win" };
  }

  // Atomic award — the unique(user_id, reward_type) constraint inside the RPC
  // makes it once-per-user; +5 and chess_reward_claimed flip in one transaction.
  const award = await deps.claimReward({
    moveCount: claim.moves.length,
    playerColor: claim.playerColor,
    finalFen: replay.engine.fen(),
  });
  if (!award.ok)
    return { kind: "internal", detail: "claim_chess_reward rpc failed" };

  const result = award.result;
  if (!result || typeof result.claimed !== "boolean") {
    return {
      kind: "internal",
      detail: "claim_chess_reward returned unexpected shape",
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
