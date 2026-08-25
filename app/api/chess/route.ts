import { NextResponse, type NextRequest } from "next/server";

import { apiError, parseJsonBody, requireUser } from "@/lib/server/http";
import { claimChessReward } from "@/lib/chess/claim";
import { RATE_LIMIT_WINDOW_MS } from "@/lib/chess/constants";
import { CHESS_REWARD_CREDITS } from "@/lib/credits/constants";
import { parseChessClaim } from "@/lib/validation/chess";
import type {
  ChessClaimErrorCode,
  ChessClaimSuccess,
  ClaimChessRewardResult,
} from "@/types/chess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Replay is local CPU bounded by MAX_SUBMITTED_MOVES — no upstream call — so
// attempts are metered only as a rate-limit counter (chess_claim_attempts),
// not for billing; this cap exists so a stuck function never runs indefinitely.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // 1) Auth — the reward belongs to a verified session (§3.7, §21).
  const auth = await requireUser("Sign in to claim the chess reward.");
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // 2) Validation — shape-check the submission before any DB work (§33.11).
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return apiError<ChessClaimErrorCode>(
      "invalid",
      "Request body must be valid JSON.",
      400,
    );
  }
  const parsed = parseChessClaim(parsedBody.body);
  if (!parsed.ok) {
    return apiError<ChessClaimErrorCode>("invalid", parsed.error, 400);
  }

  // 3) The claim — §3.7's policy lives in lib/chess/claim.ts; the closures
  //    below are the Supabase adapter it runs against. Nothing here decides.
  const outcome = await claimChessReward(
    {
      getProfile: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("credits_remaining, chess_reward_claimed")
          .eq("id", user.id)
          .single();
        if (error || !data) {
          console.error(
            "[chess] profiles read error:",
            error?.message ?? "no profile row",
          );
          return { ok: false };
        }
        return {
          ok: true,
          chessRewardClaimed: data.chess_reward_claimed,
          creditsRemaining: data.credits_remaining,
        };
      },
      claimReward: async (metadata) => {
        const { data, error } = await supabase.rpc("claim_chess_reward", {
          p_user_id: user.id,
          p_metadata: metadata,
        });
        if (error) {
          console.error("[chess] claim_chess_reward error:", error.message);
          return { ok: false };
        }
        // The RPC returns jsonb; ClaimChessRewardResult is hand-maintained
        // against it and shape-checked inside claim.ts.
        return { ok: true, result: data as ClaimChessRewardResult | null };
      },
      countRecentAttempts: async (windowStartIso) => {
        const { count, error } = await supabase
          .from("chess_claim_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", windowStartIso);
        if (error) {
          console.error("[chess] attempt count error:", error.message);
          return { ok: false };
        }
        return { ok: true, count: count ?? 0 };
      },
      recordAttempt: async () => {
        const { error } = await supabase
          .from("chess_claim_attempts")
          .insert({ user_id: user.id });
        // Best-effort: a missed attempt row must never deny a claim.
        if (error) {
          console.error("[chess] record attempt error:", error.message);
        }
      },
    },
    parsed.claim,
    Date.now(),
  );

  // 4) Outcome → HTTP. Every wire shape is unchanged from before.
  switch (outcome.kind) {
    case "ok": {
      const body: ChessClaimSuccess = {
        ok: true,
        creditsAwarded: CHESS_REWARD_CREDITS,
        creditsRemaining: outcome.creditsRemaining,
      };
      return NextResponse.json(body);
    }
    case "already_claimed":
      return apiError<ChessClaimErrorCode>(
        "already_claimed",
        "You've already claimed the chess reward.",
        409,
        {
          ...(outcome.creditsRemaining !== undefined
            ? { creditsRemaining: outcome.creditsRemaining }
            : {}),
        },
      );
    case "illegal_game":
      return apiError<ChessClaimErrorCode>(
        "illegal_game",
        `Move ${outcome.atIndex + 1} is not legal — the game was rejected.`,
        422,
      );
    case "not_a_win":
      return apiError<ChessClaimErrorCode>(
        "not_a_win",
        "Only a game you won by checkmate earns the reward.",
        422,
      );
    case "rate_limited":
      return apiError<ChessClaimErrorCode>(
        "rate_limited",
        "Too many claim attempts — please wait a moment.",
        429,
        { retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000 },
      );
    case "internal":
      console.error("[chess] internal:", outcome.detail);
      return apiError<ChessClaimErrorCode>(
        "internal",
        "Something went wrong on our side — please try again.",
        500,
      );
  }
}
