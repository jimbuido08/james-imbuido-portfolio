/**
 * Pure, synchronous contact-message validation. Strict TS, no `any`; returns a
 * union so callers never throw on bad input (mirrors lib/validation/jtb.ts).
 */
import {
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from "@/lib/contact/constants";

export type ContactMessageResult =
  | { ok: true; value: { name: string; email: string; message: string } }
  | { ok: false; error: string };

/** Keep printable characters plus tab (\t) and newline (\n); strip all other control chars. */
function isAllowedChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 32 || code === 9 || code === 10;
}

function cleanString(raw: string): string {
  return [...raw].filter(isAllowedChar).join("").trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContactMessage(body: unknown): ContactMessageResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const fields = body as Record<string, unknown>;

  // Honeypot — real users never fill the hidden "website" input. Fail with a
  // generic error so bots learn nothing; nothing is written to the database
  // and the rate limit is not consumed.
  if (typeof fields.website === "string" && fields.website.trim() !== "") {
    return { ok: false, error: "Submission could not be accepted." };
  }

  if (typeof fields.name !== "string") {
    return { ok: false, error: 'A string "name" field is required.' };
  }
  const name = cleanString(fields.name);
  if (!name) return { ok: false, error: "Name must not be empty." };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }

  if (typeof fields.email !== "string") {
    return { ok: false, error: 'A string "email" field is required.' };
  }
  const email = cleanString(fields.email);
  if (!email) return { ok: false, error: "Email must not be empty." };
  if (email.length > MAX_EMAIL_LENGTH) {
    return {
      ok: false,
      error: `Email must be at most ${MAX_EMAIL_LENGTH} characters.`,
    };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Email must be a valid address." };
  }

  if (typeof fields.message !== "string") {
    return { ok: false, error: 'A string "message" field is required.' };
  }
  const message = cleanString(fields.message);
  if (!message) return { ok: false, error: "Message must not be empty." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  return { ok: true, value: { name, email, message } };
}
