/**
 * Chess submission bounds (§3.7). The reward size lives with the rest of the
 * credits economy in lib/credits/constants.ts.
 */

/** Upper bound on submitted moves per claim — replay is local CPU, so this caps it. */
export const MAX_SUBMITTED_MOVES = 300;

/** Rate limit: at most this many claim attempts per user per window. */
export const RATE_LIMIT_MAX_ATTEMPTS = 10;

/** Rate-limit window in milliseconds, counted from chess_claim_attempts.created_at. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
