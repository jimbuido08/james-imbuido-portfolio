"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  outcomeErrorMessage,
  postJsonApi,
  useApiSubmit,
} from "@/lib/client/submit";
import { VOICE_REWARD_CREDITS } from "@/lib/credits/constants";
import type { VoiceClaimError, VoiceClaimSuccess } from "@/types/voice";

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/**
 * One-time +2 reward CTA for trying /voice. The request body is empty —
 * synthesis is device-only, so there is nothing to submit and nothing the
 * server could verify from a payload; auth, once-per-user, and the rate gate
 * are the whole policy (server-authoritative in claim_voice_reward).
 */
export function VoiceRewardClaim() {
  const { state, submit } = useApiSubmit<VoiceClaimSuccess, VoiceClaimError>();
  const outcome = state.kind === "done" ? state.outcome : null;
  const submitting = state.kind === "submitting";

  async function handleClaim(): Promise<void> {
    await submit(() =>
      postJsonApi<VoiceClaimSuccess, VoiceClaimError>(
        "/api/voice/claim",
        null,
      ),
    );
  }

  const claimed = outcome?.kind === "ok" ? outcome.data.creditsRemaining : null;
  const claimErrorCode =
    outcome?.kind === "rejected" ? outcome.response.error.code : null;

  if (claimed !== null) {
    return (
      <p aria-live="polite" className="max-w-prose text-sm text-fg">
        Reward claimed — you now have {claimed} JTB interactions.{" "}
        <Link href="/jtb" className={linkClasses}>
          Chat with JTB
        </Link>
        .
      </p>
    );
  }

  if (claimErrorCode === "already_claimed") {
    return (
      <p className="max-w-prose text-sm text-fg-muted">
        The voice reward is already claimed on this account.
      </p>
    );
  }

  if (claimErrorCode === "unauthenticated") {
    return (
      <p className="max-w-prose text-sm text-fg-muted">
        You synthesized a voice.{" "}
        <Link href="/login" className={linkClasses}>
          Sign in
        </Link>{" "}
        and claim again to add +{VOICE_REWARD_CREDITS} JTB interactions — once
        per account.
      </p>
    );
  }

  return (
    <>
      <p className="max-w-prose text-sm text-fg-muted">
        You cloned a voice in your browser — claim +{VOICE_REWARD_CREDITS} JTB
        interactions (once per account).
      </p>
      {outcomeErrorMessage(outcome) && (
        <p role="alert" className="mt-2 text-sm text-accent-exp">
          {outcomeErrorMessage(outcome)}
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" onClick={() => void handleClaim()} disabled={submitting}>
          {submitting
            ? "Claiming…"
            : `Claim +${VOICE_REWARD_CREDITS} JTB interactions`}
        </Button>
      </div>
    </>
  );
}