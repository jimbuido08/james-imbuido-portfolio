/**
 * The one client submit pipeline. Two pieces that every "talk to an API route
 * from a form" component used to re-derive:
 *
 *  - `postJsonApi` — the fetch + envelope triage: network failure, unparseable
 *    body, typed error envelope, or success. The two shared sentences
 *    (network, unexpected) come from lib/api/messages; everything
 *    domain-specific stays in the caller's own types.
 *  - `useApiSubmit` — the state machine around it: idle → submitting → done,
 *    with a guard against concurrent submits. Components keep their own
 *    success/error rendering; they never re-derive "am I waiting?" logic.
 */

import { useRef, useState } from "react";

import {
  NETWORK_ERROR_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
} from "@/lib/api/messages";

/** How one POST ended. `rejected` carries the server's own error envelope. */
export type ApiOutcome<TOk, TErr> =
  | { kind: "ok"; data: TOk }
  | { kind: "rejected"; response: TErr }
  | { kind: "unexpected" }
  | { kind: "network" };

/**
 * POST `body` as JSON and triage the response by shape, never by trust:
 * a body with an `error` key is a failure envelope; everything else on a 2xx
 * is handed to the caller as TOk (the caller discriminates on its own fields).
 */
export async function postJsonApi<TOk, TErr>(
  url: string,
  body: unknown,
): Promise<ApiOutcome<TOk, TErr>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "network" };
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { kind: "unexpected" };
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    return { kind: "rejected", response: payload as TErr };
  }
  if (res.ok) return { kind: "ok", data: payload as TOk };
  return { kind: "unexpected" };
}

/** Human sentence for a failed outcome; null when nothing failed. */
export function outcomeErrorMessage(
  outcome: ApiOutcome<unknown, { error: { message: string } }> | null,
): string | null {
  if (!outcome || outcome.kind === "ok") return null;
  if (outcome.kind === "rejected") return outcome.response.error.message;
  return outcome.kind === "unexpected"
    ? UNEXPECTED_RESPONSE_MESSAGE
    : NETWORK_ERROR_MESSAGE;
}

/** State machine shared by every form that talks to an API route. */
export type SubmitState<TOk, TErr> =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; outcome: ApiOutcome<TOk, TErr> };

export function useApiSubmit<TOk, TErr>(): {
  state: SubmitState<TOk, TErr>;
  /**
   * Run one request. Returns the outcome (or null when a submit is already in
   * flight), so callers handle results directly rather than reading state.
   */
  submit: (
    run: () => Promise<ApiOutcome<TOk, TErr>>,
  ) => Promise<ApiOutcome<TOk, TErr> | null>;
  reset: () => void;
} {
  const [state, setState] = useState<SubmitState<TOk, TErr>>({ kind: "idle" });
  const busyRef = useRef(false);

  async function submit(
    run: () => Promise<ApiOutcome<TOk, TErr>>,
  ): Promise<ApiOutcome<TOk, TErr> | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setState({ kind: "submitting" });
    try {
      const outcome = await run();
      setState({ kind: "done", outcome });
      return outcome;
    } finally {
      busyRef.current = false;
    }
  }

  function reset(): void {
    setState({ kind: "idle" });
  }

  return { state, submit, reset };
}
