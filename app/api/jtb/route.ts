import { NextResponse, type NextRequest } from "next/server";

import { apiError, parseJsonBody, requireUser } from "@/lib/server/http";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_LLM_MODEL,
  RETRIEVAL_MATCH_COUNT,
  RETRIEVAL_MIN_SIMILARITY,
  RETRIEVAL_TOP_K,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/jtb/constants";
import { embedTexts } from "@/lib/jtb/embeddings";
import { loadKnowledgeBaseSections } from "@/lib/jtb/knowledge-base";
import { completeChat } from "@/lib/jtb/llm";
import { retrieveContext } from "@/lib/jtb/retrieval";
import type { JtbChunkMatch } from "@/lib/jtb/retrieval";
import { runJtbTurn } from "@/lib/jtb/turn";
import type { JtbErrorCode, JtbSuccess } from "@/lib/jtb/types";
import { parseJtbMessage } from "@/lib/validation/jtb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two upstream calls can run per turn — a ~5s embed (lib/jtb/embeddings.ts,
// the jtb-embed edge function over HTTPS) and a 52s chat (lib/jtb/llm.ts
// TIMEOUT_MS, which can cold-start a cloud model) — so the function budget
// must cover both (~58s worst case).
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
  //    are the Supabase/edge-function/Ollama adapter it runs against. Nothing
  //    here decides.
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  // The user's access token authorizes the jtb-embed edge function
  // (role=authenticated; an anon key is rejected). requireUser just verified
  // the session via getUser, and the proxy keeps cookies fresh, so the
  // session's access token is current. A missing token only means the embed
  // 401s → retrieval degrades to the whole KB, never a failed reply.
  const {
    data: { session },
  } = await supabase.auth.getSession();
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
      loadKnowledgeBaseSections,
      retrieveContext: (query) =>
        retrieveContext(
          {
            embedTexts: (params) =>
              embedTexts({
                inputs: params.inputs,
                authToken: session?.access_token ?? "",
              }),
            model: DEFAULT_EMBEDDING_MODEL,
            matchCount: RETRIEVAL_MATCH_COUNT,
            topK: RETRIEVAL_TOP_K,
            minSimilarity: RETRIEVAL_MIN_SIMILARITY,
            matchChunks: async ({ queryEmbedding, matchCount }) => {
              // PostgREST takes a pgvector parameter as its JSON array form.
              const { data, error } = await supabase.rpc("match_jtb_chunks", {
                p_query_embedding: JSON.stringify(queryEmbedding),
                p_match_count: matchCount,
              });
              if (error) {
                console.error("[jtb] match_jtb_chunks error:", error.message);
                return { ok: false as const };
              }
              // types/supabase.ts can't prove the row shape across the RPC
              // seam (the deduct_credit lesson) — shape-check every row and
              // drop malformed ones rather than trust the cast.
              const matches: JtbChunkMatch[] = [];
              for (const row of (data ?? []) as unknown[]) {
                const r = row as Record<string, unknown> | null;
                if (
                  r &&
                  typeof r.section === "string" &&
                  typeof r.chunk_index === "number" &&
                  typeof r.content === "string" &&
                  typeof r.similarity === "number" &&
                  typeof r.embedding_model === "string"
                ) {
                  matches.push({
                    section: r.section,
                    chunk_index: r.chunk_index,
                    content: r.content,
                    similarity: r.similarity,
                    embedding_model: r.embedding_model,
                  });
                } else {
                  console.error(
                    "[jtb] match_jtb_chunks: dropping malformed row",
                  );
                }
              }
              return { ok: true as const, matches };
            },
          },
          query,
        ),
      completeChat: (params) => completeChat(params),
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
