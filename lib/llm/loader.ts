/**
 * Network loaders for LLM Lab — the ONLY network calls the feature makes.
 * Two jobs, one file, same fetch policy for both: retry network/5xx twice
 * with 1 s/3 s backoff, fail fast on 4xx, and never leak raw browser errors
 * ("Failed to fetch" becomes a human sentence). Mirrors fetchGraph in
 * lib/voice/engine.ts.
 *
 *   fetchSampleArtifact — James's shipped checkpoint from /models/llm/.
 *   fetchUrlText        — the visitor-supplied corpus URL (client-side fetch
 *                         only; CORS failures explain the paste fallback).
 */
import { SAMPLE_ARTIFACT_URL } from "./config";

const RETRY_DELAYS_MS = [1000, 3000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The site's single fetch-with-retry policy (2 retries at 1s/3s, 4xx fail-fast).
 * Exported for lib/storyteller/loader.ts — one retry owner, two consumers.
 */
export async function fetchWithRetry(
  url: string,
  notFoundSentence: string,
  failSentence: string,
): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt === RETRY_DELAYS_MS.length;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // 4xx is hopeless (or genuinely absent) — don't retry it.
        if (res.status >= 400 && res.status < 500)
          throw new Error(`${notFoundSentence} (HTTP ${res.status}).`);
        if (last) throw new Error(failSentence);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      const isHttp = err instanceof Error && err.message.includes("(HTTP");
      if (last || isHttp)
        throw err instanceof Error ? err : new Error(failSentence);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** James's bundled sample checkpoint. */
export async function fetchSampleArtifact(
  url: string = SAMPLE_ARTIFACT_URL,
): Promise<Uint8Array> {
  return fetchWithRetry(
    url,
    "The sample model isn't available",
    "Couldn't download the sample model — check your connection and try again.",
  );
}

export const URL_CORPUS_MAX_BYTES = 512 * 1024;
export const URL_CORPUS_TIMEOUT_MS = 10_000;

/**
 * Fetch a visitor-supplied URL as training text, streaming so oversized
 * responses abort early. Client-side fetch only — no server proxy — so CORS
 * denials are expected and get a paste-instead suggestion.
 */
export async function fetchUrlText(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      throw new Error("not http");
  } catch {
    throw new Error(
      "That doesn't look like a web address — try a full https:// link.",
    );
  }

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(URL_CORPUS_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "That site didn't let your browser read the file (CORS). Download it yourself, then paste the text instead.",
    );
  }
  if (!res.ok)
    throw new Error(
      `That address returned HTTP ${res.status} — check the link and try again.`,
    );
  if (!res.body) throw new Error("That address didn't return a readable file.");

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > URL_CORPUS_MAX_BYTES) {
      await reader.cancel();
      throw new Error(
        `That file is over ${Math.round(URL_CORPUS_MAX_BYTES / 1024)} KB — paste a shorter excerpt instead.`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, off);
    off += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
