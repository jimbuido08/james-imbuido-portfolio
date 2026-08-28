/**
 * Server-only module: the JTB embedding client for the jtb-embed Supabase
 * Edge Function (supabase.ai gte-small). Never import from client components
 * — callers pass an auth bearer token (a user's access token on the request
 * path, the service key in scripts/kb-sync.ts) that must never be logged.
 *
 * Chat still goes to Ollama (lib/jtb/llm.ts) — chat and embeddings are
 * different providers by design: the edge function is the one embeddings host
 * reachable from Vercel, so retrieval runs in production, not just dev.
 */
import { LlmUpstreamError } from "./llm";

/** Per-invocation compute caps for the edge function: it is killed with HTTP
 *  546 past ~2.4s of inference (measured 2026-08-28 — ~0.4s per 1500-char
 *  input, ~0.18s per short one). Each sub-request is a separate invocation
 *  with a fresh budget, so embedTexts splits its inputs and concatenates. */
const MAX_BATCH_INPUTS = 4;
const MAX_BATCH_CHARS = 4000;

/** Abort each sub-request this long after starting. The inference itself is
 *  bounded well below this by the CPU kill, so hitting it means the function
 *  is unreachable — a slow embed is a retrieval miss, not a hung reply. */
const EMBED_TIMEOUT_MS = 5_000;

/**
 * Embed a batch of texts via the deployed jtb-embed edge function. The URL
 * defaults to this project's function (derived from NEXT_PUBLIC_SUPABASE_URL,
 * so Vercel needs no new env var); JTB_EMBEDDING_URL overrides it (the
 * dead-endpoint drill, or any future compatible host).
 *
 * The model is owned by the function (gte-small) — callers never pass one.
 * Transport failures and malformed responses throw LlmUpstreamError; the
 * caller (retrieval / the sync script) decides what a failure means.
 */
export async function embedTexts(params: {
  inputs: string[];
  /** Bearer JWT for the function: the user's access token on the request
   *  path (role=authenticated), the service key for `npm run kb:sync`
   *  (role=service_role). An anon/publishable key is rejected with 403. */
  authToken: string;
  /** Abort budget per sub-request. A slow embed is a retrieval miss on the
   *  request path; batch callers like scripts/kb-sync.ts pass longer. */
  timeoutMs?: number;
}): Promise<number[][]> {
  if (params.inputs.length === 0) return [];

  const baseUrl = process.env.JTB_EMBEDDING_URL
    ? process.env.JTB_EMBEDDING_URL.replace(/\/+$/, "")
    : `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/jtb-embed`;
  if (!baseUrl.replace("https://", "")) {
    throw new LlmUpstreamError(
      "No embed endpoint — NEXT_PUBLIC_SUPABASE_URL and JTB_EMBEDDING_URL are both unset",
    );
  }

  const out: number[][] = [];
  let batch: string[] = [];
  let chars = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      params.timeoutMs ?? EMBED_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.authToken}`,
        },
        body: JSON.stringify({ inputs: batch }),
        signal: controller.signal,
      });
    } catch (error) {
      // Connection failure, DNS, TLS, or abort.
      throw new LlmUpstreamError(
        error instanceof Error ? error.message : "Embed request failed",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let detail = `jtb-embed returned ${response.status}`;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string" && body.error) detail = body.error;
      } catch {
        // Non-JSON error body — keep the status-based message.
      }
      throw new LlmUpstreamError(detail, response.status);
    }

    let data: { embeddings?: unknown };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new LlmUpstreamError(
        "jtb-embed returned a malformed embedding response",
      );
    }

    const embeddings = data.embeddings;
    if (
      !Array.isArray(embeddings) ||
      embeddings.length !== batch.length ||
      embeddings.some(
        (vector) =>
          !Array.isArray(vector) ||
          vector.length === 0 ||
          vector.some((v) => typeof v !== "number"),
      )
    ) {
      throw new LlmUpstreamError(
        "jtb-embed returned a malformed embedding response",
      );
    }
    out.push(...(embeddings as number[][]));
    batch = [];
    chars = 0;
  };

  for (const input of params.inputs) {
    if (
      batch.length >= MAX_BATCH_INPUTS ||
      (batch.length > 0 && chars + input.length > MAX_BATCH_CHARS)
    ) {
      await flush();
    }
    batch.push(input);
    chars += input.length;
  }
  await flush();

  return out;
}
