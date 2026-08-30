import { NextResponse, type NextRequest } from "next/server";

import { llmModel } from "@/lib/config";
import {
  apiError,
  invalidJsonError,
  outcomeError,
  parseJsonBody,
  requireUser,
} from "@/lib/server/http";
import {
  DEFAULT_EMBEDDING_MODEL,
  RETRIEVAL_MATCH_COUNT,
  RETRIEVAL_MIN_SIMILARITY,
  RETRIEVAL_TOP_K,
} from "@/lib/jtb/constants";
import { embedBearerToken, embedTexts } from "@/lib/jtb/embeddings";
import { loadKnowledgeBaseSections } from "@/lib/jtb/knowledge-base";
import { completeChat } from "@/lib/jtb/llm";
import { normalizeChunkMatchRows, retrieveContext } from "@/lib/jtb/retrieval";
import { describeOutcome, runJtbTurn } from "@/lib/jtb/turn";
import type { JtbSuccess } from "@/lib/jtb/types";
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
  if (!parsedBody.ok) return invalidJsonError();
  const parsed = parseJtbMessage(parsedBody.body);
  if (!parsed.ok) {
    return apiError<"invalid">("invalid", parsed.error, 400);
  }

  // 3) The turn — §5.1's policy lives in lib/jtb/turn.ts; the closures below
  //    are the Supabase/edge-function/Ollama adapter it runs against. Nothing
  //    here decides.
  const authToken = await embedBearerToken(supabase);
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
              embedTexts({ inputs: params.inputs, authToken }),
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
              return {
                ok: true as const,
                matches: normalizeChunkMatchRows(data),
              };
            },
          },
          query,
        ),
      completeChat,
      deductCredit: async () => {
        const { data, error } = await supabase.rpc("deduct_credit", {
          p_user_id: user.id,
        });
        if (error) {
          console.error("[jtb] deduct_credit error:", error.message);
          return { ok: false };
        }
        // The RPC returns jsonb since the rate-gate migration:
        // { rateLimited: true } or { creditsRemaining: number | null }.
        // types/supabase.ts can't prove the shape across the RPC seam (the
        // match_jtb_chunks lesson) — unwrap through a narrow check and let
        // turn.ts decide what it means.
        const unwrap = data as {
          rateLimited?: unknown;
          creditsRemaining?: unknown;
        } | null;
        if (unwrap?.rateLimited === true) {
          return { ok: true, rateLimited: true as const };
        }
        if (!unwrap || !("creditsRemaining" in unwrap)) {
          return { ok: false };
        }
        const creditsRemaining = unwrap.creditsRemaining;
        return {
          ok: true,
          creditsRemaining:
            typeof creditsRemaining === "number" ? creditsRemaining : null,
        };
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
    { model: llmModel(), message: parsed.message, nowMs: Date.now() },
  );

  // 4) Outcome → HTTP. Success is built here; every error view comes from the
  //    outcome table in lib/jtb/turn.ts (describeOutcome).
  if (outcome.kind !== "ok") {
    if (outcome.kind === "kb_unavailable") {
      console.error("[jtb] knowledge base unavailable — refusing to answer");
    } else if ("detail" in outcome) {
      console.error(`[jtb] ${outcome.kind}:`, outcome.detail);
    }
    return outcomeError(describeOutcome(outcome));
  }

  const body: JtbSuccess = {
    reply: outcome.reply,
    creditsRemaining: outcome.creditsRemaining,
  };
  return NextResponse.json(body);
}
