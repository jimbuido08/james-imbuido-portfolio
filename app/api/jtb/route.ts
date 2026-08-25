import { NextResponse, type NextRequest } from "next/server";

import { apiError, parseJsonBody, requireUser } from "@/lib/server/http";
import { DEFAULT_LLM_MODEL, RATE_LIMIT_WINDOW_MS } from "@/lib/jtb/constants";
import { loadKnowledgeBase } from "@/lib/jtb/knowledge-base";
import { completeChat } from "@/lib/jtb/llm";
import { runJtbTurn } from "@/lib/jtb/turn";
import type { JtbErrorCode, JtbSuccess } from "@/lib/jtb/types";
import { parseJtbMessage } from "@/lib/validation/jtb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The route calls an external cloud LLM that can cold-start a model; allow
// the function to run long enough for lib/jtb/llm.ts to abort cleanly (55s).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1) Auth — every later step requires a verified session (§5.1).
  const auth = await requireUser("Sign in to use JTB.");
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  // 2) Validation — parse the body, then validate the message.
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return apiError<JtbErrorCode>(
      "invalid",
      "Request body must be valid JSON.",
      400,
    );
  }
  const parsed = parseJtbMessage(parsedBody.body);
  if (!parsed.ok) {
    return apiError<JtbErrorCode>("invalid", parsed.error, 400);
  }

  // 3) The turn — §5.1's policy lives in lib/jtb/turn.ts; the closures below
  //    are the Supabase/Ollama adapter it runs against. Nothing here decides.
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const outcome = await runJtbTurn(
    {
      getCreditsRemaining: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("credits_remaining")
          .eq("id", user.id)
          .single();
        if (error || !data) {
          console.error(
            "[jtb] profiles read error:",
            error?.message ?? "no profile row",
          );
          return { ok: false };
        }
        return { ok: true, creditsRemaining: data.credits_remaining };
      },
      countRecentAttempts: async (windowStartIso) => {
        const { count, error } = await supabase
          .from("chat_interactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", windowStartIso);
        if (error) {
          console.error("[jtb] interaction count error:", error.message);
          return { ok: false };
        }
        return { ok: true, count: count ?? 0 };
      },
      loadKnowledgeBase,
      completeChat,
      deductCredit: async () => {
        const { data, error } = await supabase.rpc("deduct_credit", {
          p_user_id: user.id,
        });
        if (error) {
          console.error("[jtb] deduct_credit error:", error.message);
          return { ok: false };
        }
        // types/supabase.ts declares Returns: number, but the SQL returns NULL
        // on exhaustion — the null is contained at this seam (turn.ts decides
        // what it means).
        return { ok: true, creditsRemaining: data as number | null };
      },
      recordInteraction: async ({ request: req, response: res }) => {
        const { error } = await supabase.rpc("record_chat_interaction", {
          p_user_id: user.id,
          p_request_metadata: req,
          p_response_metadata: res,
        });
        // Best-effort, metadata only, never message content (§17, §21). A
        // missed audit row is preferable to denying the reply after the
        // credit was already deducted.
        if (error) {
          console.error("[jtb] record_chat_interaction error:", error.message);
        }
      },
    },
    { model, message: parsed.message, nowMs: Date.now() },
  );

  // 4) Outcome → HTTP. Every wire shape is unchanged from before.
  switch (outcome.kind) {
    case "ok": {
      const body: JtbSuccess = {
        reply: outcome.reply,
        creditsRemaining: outcome.creditsRemaining,
      };
      return NextResponse.json(body);
    }
    case "exhausted":
      return apiError<JtbErrorCode>(
        "exhausted",
        "You've used all your JTB interactions.",
        402,
        { creditsRemaining: 0 },
      );
    case "rate_limited":
      return apiError<JtbErrorCode>(
        "rate_limited",
        "You're sending messages too quickly — please wait a moment.",
        429,
        { retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000 },
      );
    case "kb_unavailable":
      console.error("[jtb] knowledge base unavailable — refusing to answer");
      return apiError<JtbErrorCode>(
        "unavailable",
        "JTB isn't ready yet — please check back soon.",
        503,
      );
    case "llm_config_error":
      console.error("[jtb] LLM config error:", outcome.detail);
      return apiError<JtbErrorCode>(
        "internal",
        "JTB is temporarily misconfigured.",
        500,
      );
    case "llm_failure":
      console.error("[jtb] LLM failure:", outcome.detail);
      return apiError<JtbErrorCode>(
        "llm_failure",
        "Something went wrong — your credit was not used.",
        502,
      );
    case "internal":
      console.error("[jtb] internal:", outcome.detail);
      return apiError<JtbErrorCode>(
        "internal",
        "Something went wrong on our side — please try again.",
        500,
      );
  }
}
