import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_LLM_MODEL,
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/jtb/constants";
import { loadKnowledgeBase } from "@/lib/jtb/knowledge-base";
import { buildSystemPrompt } from "@/lib/jtb/prompt";
import { completeChat, LlmConfigError } from "@/lib/jtb/llm";
import type { LlmChatResult } from "@/lib/jtb/llm";
import type { JtbError, JtbErrorCode } from "@/lib/jtb/types";
import { parseJtbMessage } from "@/lib/validation/jtb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The route calls an external cloud LLM that can cold-start a model; allow
// the function to run long enough for lib/jtb/llm.ts to abort cleanly (55s).
export const maxDuration = 60;

function errorResponse(
  code: JtbErrorCode,
  message: string,
  status: number,
  options?: { creditsRemaining?: number; retryAfterSeconds?: number },
): NextResponse {
  const body: JtbError = {
    error: {
      code,
      message,
      ...(options?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: options.retryAfterSeconds }
        : {}),
    },
    ...(options?.creditsRemaining !== undefined
      ? { creditsRemaining: options.creditsRemaining }
      : {}),
  };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  // 1) Auth — every later step requires a verified session (§5.1).
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse("unauthenticated", "Sign in to use JTB.", 401);
  }

  // 2) Credit pre-check — RLS scopes this to the caller's own row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();
  if ((profile?.credits_remaining ?? 0) <= 0) {
    return errorResponse(
      "exhausted",
      "You've used all your JTB interactions.",
      402,
      { creditsRemaining: 0 },
    );
  }

  // 3) Rate limit — count of this user's interactions in the trailing window.
  const windowStart = new Date(
    Date.now() - (RATE_LIMIT_WINDOW_MS + 1000),
  ).toISOString();
  const { count } = await supabase
    .from("chat_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= RATE_LIMIT_MAX_MESSAGES) {
    return errorResponse(
      "rate_limited",
      "You're sending messages too quickly — please wait a moment.",
      429,
      { retryAfterSeconds: 60 },
    );
  }

  // 4) Validation — parse the body, then validate the message.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid", "Request body must be valid JSON.", 400);
  }
  const parsed = parseJtbMessage(body);
  if (!parsed.ok) {
    return errorResponse("invalid", parsed.error, 400);
  }

  // 5) Knowledge base — fail closed if nothing real is loaded yet.
  const knowledgeBase = loadKnowledgeBase();
  if (!knowledgeBase) {
    console.error("[jtb] knowledge base unavailable — refusing to answer");
    return errorResponse(
      "unavailable",
      "JTB isn't ready yet — please check back soon.",
      503,
    );
  }

  // 6) LLM call — the one expensive step. No credit is deducted until it
  //    succeeds, and nothing about the user's message is ever logged (§21).
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  let result: LlmChatResult;
  try {
    result = await completeChat({
      model,
      system: buildSystemPrompt(knowledgeBase),
      userMessage: parsed.message,
    });
  } catch (error) {
    if (error instanceof LlmConfigError) {
      console.error("[jtb] LLM config error:", error.message);
      return errorResponse(
        "internal",
        "JTB is temporarily misconfigured.",
        500,
      );
    }
    console.error(
      "[jtb] LLM failure:",
      error instanceof Error ? error.message : String(error),
    );
    return errorResponse(
      "llm_failure",
      "Something went wrong — your credit was not used.",
      502,
    );
  }

  // 7) Deduct exactly 1 — atomic in the DB, only after a successful response.
  const { data: creditsRemaining, error: deductError } = await supabase.rpc(
    "deduct_credit",
    { p_user_id: user.id },
  );
  if (deductError) {
    console.error("[jtb] deduct_credit error:", deductError.message);
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }
  if (creditsRemaining === null) {
    // Lost the race to zero: another request used the last credit. Do not
    // deliver the reply — the user has no balance left to pay for it.
    return errorResponse(
      "exhausted",
      "You've used all your JTB interactions.",
      402,
      { creditsRemaining: 0 },
    );
  }

  // 8) Usage metadata — best-effort, metadata only, never message content (§17).
  const { error: recordError } = await supabase.rpc(
    "record_chat_interaction",
    {
      p_user_id: user.id,
      p_request_metadata: { messageLength: parsed.message.length, model },
      p_response_metadata: {
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        stopReason: result.stopReason,
      },
    },
  );
  if (recordError) {
    // A missed audit row is preferable to denying the reply after the credit
    // was already deducted.
    console.error(
      "[jtb] record_chat_interaction error:",
      recordError.message,
    );
  }

  // 9) Success.
  return NextResponse.json({ reply: result.content, creditsRemaining });
}
