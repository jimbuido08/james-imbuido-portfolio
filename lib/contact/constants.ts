/**
 * Contact constants. Pure module — safe to import from client components.
 * The 5-per-hour limit is deliberately tighter than JTB's 10-per-minute:
 * the contact form is unauthenticated, so the limiter is per-IP.
 */

/** Longest allowed sender name in characters (enforced in lib/validation/contact.ts). */
export const MAX_NAME_LENGTH = 100;

/** Longest allowed sender email in characters — the RFC 5321 maximum path length. */
export const MAX_EMAIL_LENGTH = 254;

/** Longest allowed message in characters (enforced in lib/validation/contact.ts). */
export const MAX_MESSAGE_LENGTH = 2000;

/** Rate limit: at most this many messages per client IP per window. */
export const RATE_LIMIT_MAX_MESSAGES = 5;

/** Rate-limit window in milliseconds, counted from contact_messages.created_at. */
export const RATE_LIMIT_WINDOW_MS = 3_600_000;
