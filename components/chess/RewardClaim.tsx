"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { CHESS_REWARD_CREDITS } from "@/lib/chess/constants";
import type {
  ChessClaimError,
  ChessClaimSuccess,
  Side,
  SubmittedMove,
} from "@/types/chess";

type ClaimState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "claimed"; creditsRemaining: number }
  | { kind: "already_claimed" }
  | { kind: "unauthenticated" }
  | { kind: "failed"; message: string };

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
  const [state, setState] = useState<ClaimState>({ kind: "idle" });

  async function handleClaim(): Promise<void> {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/chess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, playerColor }),
      });
      const data = (await res.json()) as ChessClaimSuccess | ChessClaimError;
      if (res.ok && "ok" in data && data.ok) {
        setState({ kind: "claimed", creditsRemaining: data.creditsRemaining });
        return;
      }
      if (!("error" in data)) {
        setState({ kind: "failed", message: "Unexpected server response." });
        return;
      }
      switch (data.error.code) {
        case "unauthenticated":
          setState({ kind: "unauthenticated" });
          return;
        case "already_claimed":
          setState({ kind: "already_claimed" });
          return;
        default:
          setState({ kind: "failed", message: data.error.message });
      }
    } catch {
      setState({
        kind: "failed",
        message: "Couldn't reach the server — check your connection.",
      });
    }
  }

  if (state.kind === "claimed") {
    return (
      <p aria-live="polite" className="mt-2 max-w-prose text-sm text-fg">
        Reward claimed — you now have {state.creditsRemaining} JTB interactions.{" "}
        <Link href="/jtb" className={linkClasses}>
          Chat with JTB
        </Link>
        .
      </p>
    );
  }

  if (state.kind === "already_claimed") {
    return (
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        The chess reward is already claimed on this account.
      </p>
    );
  }

  if (state.kind === "unauthenticated") {
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
      {state.kind === "failed" && (
        <p role="alert" className="mt-2 text-sm text-accent-exp">
          {state.message}
        </p>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          onClick={() => void handleClaim()}
          disabled={state.kind === "submitting"}
        >
          {state.kind === "submitting"
            ? "Verifying your win…"
            : `Claim +${CHESS_REWARD_CREDITS} JTB interactions`}
        </Button>
      </div>
    </>
  );
}
