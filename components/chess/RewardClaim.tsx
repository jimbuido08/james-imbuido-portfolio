"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  outcomeErrorMessage,
  postJsonApi,
  useApiSubmit,
} from "@/lib/client/submit";
import { CHESS_REWARD_CREDITS } from "@/lib/credits/constants";
import type {
  ChessClaimError,
  ChessClaimSuccess,
  Side,
  SubmittedMove,
} from "@/types/chess";

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/** Game-over reward CTA: submits the move history to POST /api/chess (§3.7). */
export function RewardClaim({
  moves,
  playerColor,
}: {
  moves: SubmittedMove[];
  playerColor: Side;
}) {
  const { state, submit } = useApiSubmit<ChessClaimSuccess, ChessClaimError>();
  const outcome = state.kind === "done" ? state.outcome : null;
  const submitting = state.kind === "submitting";

  async function handleClaim(): Promise<void> {
    await submit(() =>
      postJsonApi<ChessClaimSuccess, ChessClaimError>("/api/chess", {
        moves,
        playerColor,
      }),
    );
  }

  // Render vocabulary derived from the outcome, not stored separately — the
  // claim UI can never drift from what the server actually answered.
  const claimed = outcome?.kind === "ok" ? outcome.data.creditsRemaining : null;

  const claimErrorCode: ChessClaimError["error"]["code"] | null =
    outcome?.kind === "rejected" ? outcome.response.error.code : null;

  const failureMessage =
    claimErrorCode === "unauthenticated" || claimErrorCode === "already_claimed"
      ? null
      : outcomeErrorMessage(outcome);

  if (claimed !== null) {
    return (
      <p aria-live="polite" className="mt-2 max-w-prose text-sm text-fg">
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
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        The chess reward is already claimed on this account.
      </p>
    );
  }

  if (claimErrorCode === "unauthenticated") {
    return (
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        You won by checkmate.{" "}
        <Link href="/login" className={linkClasses}>
          Sign in
        </Link>{" "}
        and claim again to add +{CHESS_REWARD_CREDITS} JTB interactions — once
        per account.
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        You beat the Chess AI by checkmate — claim +{CHESS_REWARD_CREDITS} JTB
        interactions (once per account).
      </p>
      {failureMessage && (
        <p role="alert" className="mt-2 text-sm text-accent-exp">
          {failureMessage}
        </p>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          onClick={() => void handleClaim()}
          disabled={submitting}
        >
          {submitting
            ? "Verifying your win…"
            : `Claim +${CHESS_REWARD_CREDITS} JTB interactions`}
        </Button>
      </div>
    </>
  );
}
