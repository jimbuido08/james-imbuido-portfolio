/**
 * The JTB turn — §5.1's policy as one decision core. All infrastructure
 * (Supabase queries/RPCs, the LLM call, the clock) enters through the injected
 * deps; this module performs no I/O setup of its own, so every branch —
 * exhaustion, rate limit, missing KB, LLM failure, the lost deduct race — is
 * exercisable through this interface with in-memory substitutes.
 *
 * Server-only in effect: deps are constructed with the server Supabase client
 * and the Ollama credentials in the route. Never import from client components.
 */
import { INTERNAL_SERVER_MESSAGE } from "@/lib/api/messages";
import { rateWindowStart } from "@/lib/ratelimit/window";
import type { OutcomeView } from "@/lib/server/http";

import { RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS } from "./constants";
import { formatKnowledgeBaseSections, type JtbSection } from "./knowledge-base";
import { LlmConfigError } from "./llm";
import type { LlmChatResult } from "./llm";
import { buildSystemPrompt } from "./prompt";
import type { JtbRetrieval } from "./retrieval";
import type { JtbErrorCode } from "./types";
import type { JsonObject } from "@/types/json";

export interface JtbTurnDeps {
  /**
   * Caller's credit balance. A read failure is infrastructure trouble and must
   * surface as internal — never as "exhausted" (DB hiccups are not spending).
   */
  getCreditsRemaining(): Promise<
    { ok: true; creditsRemaining: number } | { ok: false }
  >;
  /** Count of the caller's recorded attempts in the trailing window. */
  countRecentAttempts(
    windowStartIso: string,
  ): Promise<{ ok: true; count: number } | { ok: false }>;
  /**
   * Per-section knowledge base. The §7 gate: null (an approved file unreadable
   * or nothing real loaded) is the ONLY thing that may produce
   * kb_unavailable — retrieval can narrow a healthy KB, never mask a broken
   * one.
   */
  loadKnowledgeBaseSections(): JtbSection[] | null;
  /**
   * Grounding for this message, or why retrieval was skipped. Never throws;
   * every { ok:false } degrades to the whole KB (pre-RAG behaviour).
   */
  retrieveContext(query: string): Promise<JtbRetrieval>;
  /** The one expensive step — throws LlmConfigError / LlmUpstreamError. */
  completeChat(params: {
    model: string;
    system: string;
    userMessage: string;
  }): Promise<LlmChatResult>;
  /**
   * Atomic −1 in the DB. creditsRemaining null = lost the race to zero.
   * rateLimited = the RPC's authoritative rate gate refused (the caller
   * raced past, or bypassed, the pre-check).
   */
  deductCredit(): Promise<
    | { ok: true; creditsRemaining: number | null }
    | { ok: true; rateLimited: true }
    | { ok: false }
  >;
  /**
   * Metadata-only audit row — never message content (§21). Written for the
   * outcomes that reached Ollama (success, llm_failure), so the rate limit
   * counts attempts rather than just successes. Best-effort by design: the
   * reply must not be denied over a missed audit row.
   */
  recordInteraction(meta: {
    request: JsonObject;
    response: JsonObject;
  }): Promise<void>;
}

export interface JtbTurnInput {
  model: string;
  message: string;
  /** Clock injected so the rate-limit window is decidable without wall time. */
  nowMs: number;
}

export type JtbTurnOutcome =
  | { kind: "ok"; reply: string; creditsRemaining: number }
  | { kind: "exhausted" }
  | { kind: "rate_limited" }
  | { kind: "kb_unavailable" }
  | { kind: "llm_config_error"; detail: string }
  | { kind: "llm_failure"; detail: string }
  | { kind: "internal"; detail: string };

/**
 * The outcome → HTTP table for the JTB route: the wire half of the outcome
 * vocabulary, ruled out per outcome kind. "ok" and its success body stay in
 * the route adapter. Two distinct internal wordings by design: llm_config_error
 * is our misconfiguration (500, "misconfigured"), while the other internal
 * outcomes carry the shared sentence. Detailed reasons never reach the wire —
 * they stay on the outcome for the route to log.
 */
export function describeOutcome(
  outcome: Exclude<JtbTurnOutcome, { kind: "ok" }>,
): OutcomeView<JtbErrorCode> {
  switch (outcome.kind) {
    case "exhausted":
      return {
        status: 402,
        code: "exhausted",
        message: "You've used all your JTB interactions.",
        creditsRemaining: 0,
      };
    case "rate_limited":
      return {
        status: 429,
        code: "rate_limited",
        message: "You're sending messages too quickly — please wait a moment.",
        retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000,
      };
    case "kb_unavailable":
      return {
        status: 503,
        code: "unavailable",
        message: "JTB isn't ready yet — please check back soon.",
      };
    case "llm_config_error":
      return {
        status: 500,
        code: "internal",
        message: "JTB is temporarily misconfigured.",
      };
    case "llm_failure":
      return {
        status: 502,
        code: "llm_failure",
        message: "Something went wrong — your credit was not used.",
      };
    case "internal":
      return {
        status: 500,
        code: "internal",
        message: INTERNAL_SERVER_MESSAGE,
      };
  }
}

export async function runJtbTurn(
  deps: JtbTurnDeps,
  input: JtbTurnInput,
): Promise<JtbTurnOutcome> {
  // Credit pre-check — cheap denial before any expensive work (§5.1).
  const profile = await deps.getCreditsRemaining();
  if (!profile.ok) return { kind: "internal", detail: "profiles read failed" };
  if (profile.creditsRemaining <= 0) return { kind: "exhausted" };

  // Rate limit — count of this caller's recorded attempts in the window.
  const windowStart = rateWindowStart(input.nowMs, RATE_LIMIT_WINDOW_MS);
  const recent = await deps.countRecentAttempts(windowStart);
  if (!recent.ok)
    return { kind: "internal", detail: "rate-limit count failed" };
  if (recent.count >= RATE_LIMIT_MAX_MESSAGES) return { kind: "rate_limited" };

  // Knowledge base — fail closed if nothing real is loaded (§7). No audit
  // row: without the KB we never reach Ollama, so there is nothing to meter.
  const sections = deps.loadKnowledgeBaseSections();
  if (!sections) return { kind: "kb_unavailable" };

  // Grounding: retrieval narrows the healthy KB to the relevant sections, and
  // any retrieval failure degrades to the whole KB (pre-RAG behaviour). The
  // prompt is ALWAYS rebuilt from loader sections — retrieval returns section
  // slugs, never text — so the framing invariant holds structurally and a
  // stale index row can never leak old copy into a prompt. (filter preserves
  // loader order; an empty filter is paranoia-guarded to the whole KB.)
  const retrieval = await deps.retrieveContext(input.message);
  const retrieved = retrieval.ok
    ? sections.filter((s) => retrieval.sections.includes(s.section))
    : [];
  const knowledgeBase = formatKnowledgeBaseSections(
    retrieved.length > 0 ? retrieved : sections,
  );

  // One shared request-meta object for every outcome that reaches Ollama —
  // success, llm_failure, and the lost deduct race all carry the same context
  // provenance. Metadata only, never message content (§21).
  const requestMeta: JsonObject = {
    messageLength: input.message.length,
    model: input.model,
    contextSource: retrieval.ok ? "retrieval" : "full_kb",
    contextChars: knowledgeBase.length,
    ...(retrieval.ok
      ? {
          retrievedSections: retrieval.sections.join(","),
          topSimilarity: Number(retrieval.topSimilarity.toFixed(4)),
        }
      : { retrievalReason: retrieval.reason }),
  };

  // The one expensive step. No credit is deducted until it succeeds (§5.1).
  let result: LlmChatResult;
  try {
    result = await deps.completeChat({
      model: input.model,
      system: buildSystemPrompt(knowledgeBase),
      userMessage: input.message,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Our misconfiguration — not caller behaviour, so not metered as an attempt.
    if (error instanceof LlmConfigError) {
      return { kind: "llm_config_error", detail };
    }
    // Upstream failure: meter it. Unlimited free Ollama hammering via failing
    // calls is exactly what the rate limit exists to stop.
    await deps.recordInteraction({
      request: requestMeta,
      response: { outcome: "llm_failure", model: input.model },
    });
    return { kind: "llm_failure", detail };
  }

  // Deduct exactly 1 — atomic in the DB, only after a successful response.
  const deduct = await deps.deductCredit();
  if (!deduct.ok) return { kind: "internal", detail: "deduct_credit failed" };
  if ("rateLimited" in deduct) {
    // The RPC's authoritative rate gate refused. No credit was taken and the
    // attempt is not metered: the user was told to slow down, not answered.
    return { kind: "rate_limited" };
  }
  if (deduct.creditsRemaining === null) {
    // Lost the race to zero: another request used the last credit. Do not
    // deliver the reply — the caller has no balance left to pay for it. The
    // attempt did reach Ollama, so it is still metered.
    await deps.recordInteraction({
      request: requestMeta,
      response: { outcome: "exhausted_race", model: input.model },
    });
    return { kind: "exhausted" };
  }

  await deps.recordInteraction({
    request: requestMeta,
    response: {
      outcome: "success",
      model: input.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      stopReason: result.stopReason,
    },
  });

  return {
    kind: "ok",
    reply: result.content,
    creditsRemaining: deduct.creditsRemaining,
  };
}
