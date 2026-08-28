/**
 * JTB constants. Pure module — safe to import from client components.
 * Owns rate-limit and LLM settings; the credits economy's shared vocabulary
 * (INITIAL_CREDITS, CHESS_REWARD_CREDITS) lives in lib/credits/constants.ts.
 */

/** Longest allowed user message in characters (enforced in lib/validation/jtb.ts). */
export const MAX_MESSAGE_LENGTH = 1000;

/** Upper bound on the LLM reply length — Ollama's `num_predict` option. */
export const MAX_RESPONSE_TOKENS = 1024;

/** Rate limit: at most this many JTB messages per user per window. */
export const RATE_LIMIT_MAX_MESSAGES = 10;

/** Rate-limit window in milliseconds, counted from chat_interactions.created_at. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Default LLM model — an Ollama cloud tag. Override with LLM_MODEL.
 * Pick a tag your Ollama account can pull; a smaller model (e.g. a -:8b tag)
 * is the one-line downgrade for cost/latency if wanted.
 */
export const DEFAULT_LLM_MODEL = "gpt-oss:120b";

/**
 * Default Ollama host — the cloud API. `/api/chat` is appended by the client,
 * so this is the bare host (no trailing `/api`). Override with OLLAMA_BASE_URL,
 * e.g. "http://localhost:11434" to point at a local Ollama.
 */
export const DEFAULT_OLLAMA_BASE_URL = "https://ollama.com";

/**
 * Retrieval — §7 grounding, narrowed per request. Embeddings come from the
 * jtb-embed Supabase Edge Function (supabase.ai gte-small) — the one
 * embeddings host reachable from Vercel, so retrieval runs identically in dev
 * and production. The model is owned by the function: a mismatch is a deploy
 * concern, not config.
 */
export const DEFAULT_EMBEDDING_MODEL = "gte-small";

/**
 * Vector width of gte-small (verified 2026-08-28 against the deployed
 * jtb-embed function: 384 dims, L2-normalized). Must equal the vector(N) in
 * the jtb_chunks migrations and match_jtb_chunks signature; a model or
 * dimension change means a new migration + full re-embed (npm run kb:sync).
 */
export const EMBEDDING_DIM = 384;

/** How many KB sections retrieval may inject (of the live ones). */
export const RETRIEVAL_TOP_K = 4;

/**
 * How many CHUNKS the match_jtb_chunks RPC returns before scores are pooled
 * back to sections. Must exceed RETRIEVAL_TOP_K: the top chunks can all
 * belong to one section (experience.md alone has 5), and pooling needs each
 * candidate section represented. 12 covers the whole current index (~14
 * chunks) at negligible cost.
 */
export const RETRIEVAL_MATCH_COUNT = 12;

/**
 * Below this cosine similarity the retrieval result is discarded for the
 * whole-KB fallback. Calibrated 2026-08-28 (.verify-gte-calibration.mts and
 * .verify-gte-prefix.mts against the 7 live sections, section-level
 * max-pooled scores with the chunking.ts section prefix): worst on-topic
 * best-match 0.845, best off-topic 0.771 — 0.81 sits mid-gap, so a marginal
 * question still retrieves while off-topic ones cleanly miss. gte-small's
 * baseline is high (any two English texts score ~0.7+), so the usable window
 * is narrow — recalibrate if the KB grows (the harnesses show how).
 */
export const RETRIEVAL_MIN_SIMILARITY = 0.81;
