/**
 * Fetch the shipped storyteller artifacts. The retry policy is the site's
 * single owner — lib/llm/loader.ts's fetchWithRetry (2 retries, 4xx fail-fast,
 * human-sentence errors) — imported, not duplicated.
 */

import { fetchWithRetry } from "../llm/loader";
import { STORYTELLER_MODEL_URL, STORYTELLER_TOKENIZER_URL } from "./config";

export function fetchStorytellerModel(): Promise<Uint8Array> {
  return fetchWithRetry(
    STORYTELLER_MODEL_URL,
    "The storyteller model isn't available",
    "The storyteller model could not be downloaded — check your connection and try again.",
  );
}

export function fetchStorytellerTokenizer(): Promise<Uint8Array> {
  return fetchWithRetry(
    STORYTELLER_TOKENIZER_URL,
    "The storyteller tokenizer isn't available",
    "The storyteller tokenizer could not be downloaded — check your connection and try again.",
  );
}
