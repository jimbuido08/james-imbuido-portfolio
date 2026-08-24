/**
 * Shared JTB API contract. Pure module — safe to import from client components.
 */

export type JtbSuccess = { reply: string; creditsRemaining: number };

export type JtbErrorCode =
  | "unauthenticated"
  | "invalid"
  | "exhausted"
  | "rate_limited"
  | "llm_failure"
  | "unavailable"
  | "internal";

export type JtbError = {
  error: {
    code: JtbErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
  creditsRemaining?: number;
};
