/**
 * Server-only module: the Ollama chat client (cloud /api/chat). Never import
 * from client components — the base URL and API key must never reach the
 * browser (master plan §21). Embeddings are a different provider entirely:
 * lib/jtb/embeddings.ts (Supabase edge function), which imports the error
 * classes from here.
 */
import { ollamaApiKey, ollamaBaseUrl } from "@/lib/config";

import { MAX_RESPONSE_TOKENS } from "./constants";

/** Thrown when required LLM configuration is missing. The route maps this to a 500. */
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}

/** Thrown when the upstream Ollama API fails. The route maps this to a 502. */
export class LlmUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmUpstreamError";
  }
}

export interface LlmChatResult {
  content: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * Abort the chat request this long after starting (route maxDuration is 60s).
 * Retrieval's embed is now an edge-function call budgeted at 5s
 * (lib/jtb/embeddings.ts), so the 60s budget still must fit both
 * (5 + 52 + ~1s overhead ≈ 58s) — chat gets 52s, not 55s.
 */
const TIMEOUT_MS = 52_000;

export async function completeChat(params: {
  model: string;
  system: string;
  userMessage: string;
}): Promise<LlmChatResult> {
  let apiKey: string;
  let url: string;
  try {
    apiKey = ollamaApiKey();
    url = `${ollamaBaseUrl()}/api/chat`;
  } catch (error) {
    // Keep the route's error contract: missing LLM config is LlmConfigError.
    throw new LlmConfigError(
      error instanceof Error ? error.message : "LLM config missing",
    );
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.userMessage },
        ],
        stream: false,
        options: { num_predict: MAX_RESPONSE_TOKENS },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    // Network failure, TLS error, or abort — nothing usable came back.
    throw new LlmUpstreamError(
      error instanceof Error ? error.message : "Ollama request failed",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = `Ollama returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) detail = body.error;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new LlmUpstreamError(detail, response.status);
  }

  let data: {
    message?: { content?: unknown };
    done_reason?: unknown;
    prompt_eval_count?: unknown;
    eval_count?: unknown;
    total_duration?: unknown;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new LlmUpstreamError("Ollama returned a malformed response");
  }

  if (typeof data.message?.content !== "string" || !data.message.content) {
    throw new LlmUpstreamError("Ollama returned an empty response");
  }

  return {
    content: data.message.content,
    stopReason: typeof data.done_reason === "string" ? data.done_reason : "",
    inputTokens:
      typeof data.prompt_eval_count === "number" ? data.prompt_eval_count : 0,
    outputTokens: typeof data.eval_count === "number" ? data.eval_count : 0,
    // total_duration is in nanoseconds; fall back to wall-clock timing.
    latencyMs:
      typeof data.total_duration === "number"
        ? Math.round(data.total_duration / 1_000_000)
        : Math.round(performance.now() - startedAt),
  };
}
