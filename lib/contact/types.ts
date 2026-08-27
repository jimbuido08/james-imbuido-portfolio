/** Shared contact-form vocabulary — the route, decision core, and client form all use these. */

export interface ContactSubmitRequest {
  name: string;
  email: string;
  message: string;
}

export type ContactErrorCode = "invalid" | "rate_limited" | "internal";

export interface ContactError {
  error: {
    code: ContactErrorCode;
    message: string;
  };
}

export interface ContactSuccess {
  ok: true;
}
