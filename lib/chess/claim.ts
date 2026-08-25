/**
 * The chess reward claim — §3.7's policy as one decision core. Server-side
 * replay (via lib/chess/engine, deterministic local code) is called directly;
 * only the Supabase reads/RPC enter through injected deps, so every branch —
 * already claimed, illegal game, not a win, lost claim race — is exercisable
 * through this interface. Never import from client components.
 */
import { replayMoves } from "./engine";
import type {
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
  | { kind: "illegal_game"; atIndex: number }
  | { kind: "not_a_win" }
  | { kind: "internal"; detail: string };

export async function claimChessReward(
  deps: ChessClaimDeps,
  claim: ChessClaimRequest,
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
  if (!award.ok) return { kind: "internal", detail: "claim_chess_reward rpc failed" };

  const result = award.result;
  if (!result || typeof result.claimed !== "boolean") {
    return { kind: "internal", detail: "claim_chess_reward returned unexpected shape" };
  }
  if (!result.claimed) {
    // Lost the pre-check race: a concurrent request claimed first.
    return { kind: "already_claimed" };
  }
  if (typeof result.creditsRemaining !== "number") {
    return { kind: "internal", detail: "claimed but no balance returned" };
  }
  return { kind: "ok", creditsRemaining: result.creditsRemaining };
}
