/**
 * Byte-level tokenization — one token per UTF-8 byte, vocab 0..255, so any
 * text (any language, punctuation, emoji) round-trips without a learned
 * vocabulary file. TextEncoder/TextDecoder are available in workers, so the
 * same module serves the page (corpus preview), the worker (training), and
 * the Node tsx gate (parity checks).
 *
 * Mirrored by reference.py (`list(text.encode("utf-8"))` /
 * `bytes(ids).decode("utf-8", errors="replace")`); the gate checks the cases
 * exactly, including multibyte sequences.
 *
 * Decoding arbitrary sampled byte ids can produce invalid UTF-8 (a sampled
 * continuation byte without its lead); TextDecoder's default replacement
 * keeps that visible-but-harmless in generated text.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decodeBytes(ids: ArrayLike<number>): string {
  const bytes = new Uint8Array(ids.length);
  for (let i = 0; i < ids.length; i++) bytes[i] = ids[i] & 0xff;
  return decoder.decode(bytes);
}

/**
 * Lowercase-hex preview of the first `max` ids — the corpus card shows "what
 * the model actually sees" ("54 68 65 20 … ≈ 'The '").
 */
export function bytePreview(ids: ArrayLike<number>, max = 40): string {
  const n = Math.min(ids.length, max);
  const parts: string[] = [];
  for (let i = 0; i < n; i++)
    parts.push((ids[i] & 0xff).toString(16).padStart(2, "0"));
  return parts.join(" ") + (ids.length > max ? " …" : "");
}
