/**
 * Password policy. Plain module (no "use server") so the signup form and the
 * server action read the same number — the client hint and the server rule
 * can never drift.
 */
export const MIN_PASSWORD_LENGTH = 8;
