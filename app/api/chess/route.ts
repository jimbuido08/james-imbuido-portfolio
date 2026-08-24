import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { replayMoves } from "@/lib/chess/engine";
import { CHESS_REWARD_CREDITS } from "@/lib/chess/constants";
import { parseChessClaim } from "@/lib/validation/chess";
import type {
  ChessClaimError,
  ChessClaimErrorCode,
  ClaimChessRewardResult,
} from "@/types/chess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  code: ChessClaimErrorCode,
  message: string,
  status: number,
  options?: { creditsRemaining?: number },
): NextResponse {
  const body: ChessClaimError = {
    error: { code, message },
    ...(options?.creditsRemaining !== undefined
      ? { creditsRemaining: options.creditsRemaining }
      : {}),
  };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  // 1) Auth — the reward belongs to a verified session (§3.7, §21).
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse(
      "unauthenticated",
      "Sign in to claim the chess reward.",
      401,
    );
  }

  // 2) Validation — shape-check the submission before any DB work (§33.11).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid", "Request body must be valid JSON.", 400);
  }
  const parsed = parseChessClaim(body);
  if (!parsed.ok) {
    return errorResponse("invalid", parsed.error, 400);
  }

  // 3) Claimed pre-check — RLS scopes this to the caller's own profile. Cheap
  //    and gives a clean 409 UX; the authoritative gate is the unique constraint
  //    enforced inside claim_chess_reward.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining, chess_reward_claimed")
    .eq("id", user.id)
    .single();
  if (profile?.chess_reward_claimed) {
    return errorResponse(
      "already_claimed",
      "You've already claimed the chess reward.",
      409,
      { creditsRemaining: profile.credits_remaining },
    );
  }

  // 4) Server-side replay — always from the standard initial position, so every
  //    move must be legal and turns must alternate. Client-provided FENs and
  //    result verdicts are never accepted (§3.7, §21).
  const replay = replayMoves(parsed.claim.moves);
  if (!replay.ok) {
    return errorResponse(
      "illegal_game",
      `Move ${replay.atIndex + 1} is not legal — the game was rejected.`,
      422,
    );
  }

  // 5) Win verification — the replayed game must be over by checkmate with the
  //    caller's side as winner. Draws, losses, resignations, and unfinished
  //    games earn nothing.
  const status = replay.engine.status();
  if (
    status.kind !== "over" ||
    status.reason !== "checkmate" ||
    status.winner !== parsed.claim.playerColor
  ) {
    return errorResponse(
      "not_a_win",
      "Only a game you won by checkmate earns the reward.",
      422,
    );
  }

  // 6) Atomic award — one SECURITY DEFINER call inserts the reward row (the
  //    unique(user_id, reward_type) constraint makes it once-per-user), credits
  //    +5, and flips chess_reward_claimed in the same transaction.
  const { data, error: claimError } = await supabase.rpc("claim_chess_reward", {
    p_user_id: user.id,
    p_metadata: {
      moveCount: parsed.claim.moves.length,
      playerColor: parsed.claim.playerColor,
      finalFen: replay.engine.fen(),
    },
  });
  if (claimError) {
    console.error("[chess] claim_chess_reward error:", claimError.message);
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }
  const claim = data as ClaimChessRewardResult | null;
  if (!claim || typeof claim.claimed !== "boolean") {
    console.error("[chess] claim_chess_reward returned unexpected shape");
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }
  if (!claim.claimed) {
    // Lost the pre-check race: the reward was claimed by a concurrent request.
    return errorResponse(
      "already_claimed",
      "You've already claimed the chess reward.",
      409,
    );
  }
  if (typeof claim.creditsRemaining !== "number") {
    console.error("[chess] claim_chess_reward claimed but no balance returned");
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }

  // 7) Success.
  return NextResponse.json({
    ok: true,
    creditsAwarded: CHESS_REWARD_CREDITS,
    creditsRemaining: claim.creditsRemaining,
  });
}
