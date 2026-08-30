/**
 * One env seam: typed accessors for every environment variable the server
 * reads. Pure value reading — no next/headers, no node built-ins — so every
 * runtime (server components, route handlers, the proxy edge runtime, and
 * throwaway tsx harnesses) shares one vocabulary for "is the config present?".
 *
 * Missing required config throws EnvConfigError at accessor time: an unset
 * variable is a deploy misconfiguration, and the failure names the variable
 * instead of surfacing as an opaque deep error from a downstream library.
 *
 * Excluded by design: scripts/kb-sync.ts reads SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY with its own interactive guidance (the app must
 * never see the service key); NEXT_PUBLIC_* vars in client components stay
 * inlined by Next's bundler rather than read at runtime.
 */

import { DEFAULT_LLM_MODEL, DEFAULT_OLLAMA_BASE_URL } from "./jtb/constants";

/** Thrown when required environment configuration is missing or empty. */
export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvConfigError(`${name} is not set`);
  }
  return value;
}

/** Supabase project URL — the `!`-assertions the wrapper clients used to make. */
export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

/** Supabase publishable (anon) key — safe for the browser by definition. */
export function supabasePublishableKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

/**
 * Salt for hashing client IPs into contact_messages.ip_hash. Unsalted hashing
 * still avoids storing raw IPs; the salt prevents trivial rainbow-matching
 * against a known IP list, so a missing salt is a hard error — the route must
 * not silently record an unsalted hash.
 */
export function contactIpSalt(): string {
  return required("CONTACT_IP_SALT");
}

/** Chat model override; the provider default otherwise. */
export function llmModel(): string {
  return process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
}

function withTrailingSlashStripped(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Ollama Cloud key — never reaches the browser (§21). */
export function ollamaApiKey(): string {
  return required("OLLAMA_API_KEY");
}

/** Ollama base URL; the provider default otherwise. */
export function ollamaBaseUrl(): string {
  return withTrailingSlashStripped(
    process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
  );
}

/**
 * The jtb-embed edge-function URL: JTB_EMBEDDING_URL overrides it (the
 * dead-endpoint drill, or any future compatible host); otherwise it is derived
 * from the project URL, so Vercel needs no new env var.
 */
export function jtbEmbeddingUrl(): string {
  if (process.env.JTB_EMBEDDING_URL) {
    return withTrailingSlashStripped(process.env.JTB_EMBEDDING_URL);
  }
  return `${withTrailingSlashStripped(supabaseUrl())}/functions/v1/jtb-embed`;
}
