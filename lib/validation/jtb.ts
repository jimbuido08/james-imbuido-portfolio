/**
 * Pure, synchronous JTB message validation. Strict TS, no `any`; returns a
 * union so callers never throw on bad input (mirrors lib/auth/actions.ts).
 */
import { MAX_MESSAGE_LENGTH } from "@/lib/jtb/constants";

export type JtbMessageResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Keep printable characters plus tab (\t) and newline (\n); strip all other control chars. */
function isAllowedChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 32 || code === 9 || code === 10;
}

export function parseJtbMessage(body: unknown): JtbMessageResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const raw = (body as Record<string, unknown>).message;
  if (typeof raw !== "string") {
    return { ok: false, error: 'A string "message" field is required.' };
  }

  const message = [...raw].filter(isAllowedChar).join("").trim();
  if (!message) return { ok: false, error: "Message must not be empty." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  return { ok: true, message };
}
