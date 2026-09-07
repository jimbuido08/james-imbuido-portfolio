import { NextResponse } from "next/server";

import { outcomeError, requireUser } from "@/lib/server/http";
import { claimVoiceReward, describeOutcome } from "@/lib/voice/claim";
import { VOICE_REWARD_CREDITS } from "@/lib/credits/constants";
import type {
  ClaimVoiceRewardResult,
  VoiceClaimSuccess,
} from "@/types/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The request body is deliberately never read: synthesis is device-only, so
// there is nothing to submit and nothing to verify — auth, once-per-user,
// and the rate gate are the whole policy. (Not parsing the body is the
// point: an empty-body claim cannot carry a fabricated result.)
export const maxDuration = 15;

export async function POST() {
  // 1) Auth — the reward belongs to a verified session.
  const auth = await requireUser("Sign in to claim the voice reward.");
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // 2) The claim — lib/voice/claim.ts's policy with the Supabase adapter.
  //    No validation stage: there is no request payload by design.
  const outcome = await claimVoiceReward(
    {
      getProfile: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("credits_remaining, voice_reward_claimed")
          .eq("id", user.id)
          .single();
        if (error || !data) {
          console.error(
            "[voice] profiles read error:",
            error?.message ?? "no profile row",
          );
          return { ok: false };
        }
        return {
          ok: true,
          voiceRewardClaimed: data.voice_reward_claimed,
          creditsRemaining: data.credits_remaining,
        };
      },
      claimReward: async (metadata) => {
        const { data, error } = await supabase.rpc("claim_voice_reward", {
          p_user_id: user.id,
          p_metadata: metadata,
        });
        if (error) {
          console.error("[voice] claim_voice_reward error:", error.message);
          return { ok: false };
        }
        return { ok: true, result: data as ClaimVoiceRewardResult | null };
      },
      countRecentAttempts: async (windowStartIso) => {
        const { count, error } = await supabase
          .from("voice_claim_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", windowStartIso);
        if (error) {
          console.error("[voice] attempt count error:", error.message);
          return { ok: false };
        }
        return { ok: true, count: count ?? 0 };
      },
      recordAttempt: async () => {
        const { error } = await supabase
          .from("voice_claim_attempts")
          .insert({ user_id: user.id });
        // Best-effort: a missed attempt row must never deny a claim.
        if (error) {
          console.error("[voice] record attempt error:", error.message);
        }
      },
    },
    Date.now(),
  );

  // 3) Outcome → HTTP. Success is built here; every error view comes from
  //    lib/voice/claim.ts's describeOutcome.
  if (outcome.kind !== "ok") {
    if ("detail" in outcome) {
      console.error(`[voice] ${outcome.kind}:`, outcome.detail);
    }
    return outcomeError(describeOutcome(outcome));
  }

  const body: VoiceClaimSuccess = {
    ok: true,
    creditsAwarded: VOICE_REWARD_CREDITS,
    creditsRemaining: outcome.creditsRemaining,
  };
  return NextResponse.json(body);
}