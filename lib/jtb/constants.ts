/**
 * JTB constants. Pure module — safe to import from client components.
 * Single source of truth for credit, rate-limit, and LLM settings (§5, §3.7).
 */

/** New users start with this many JTB interactions (§5). */
export const INITIAL_CREDITS = 10;

/** Credits awarded once for beating the Chess AI (§3.7). */
export const CHESS_REWARD_CREDITS = 5;

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
