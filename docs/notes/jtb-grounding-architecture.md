# JTB grounding architecture — per-section RAG with whole-KB fallback

**Status:** current behaviour. Originally prompt-stuffing (2026-08-24); RAG added 2026-08-28; embeddings moved to a Supabase Edge Function the same day, making retrieval work in production.

## What JTB actually does

JTB grounds answers by retrieving the most relevant `content/jtb/` sections per message and injecting only those into the system prompt — with the entire knowledge base as the guaranteed fallback. Retrieval is **section-level**: the stored index is chunk-level (a gte-small storage detail, below), but chunk scores are max-pooled back to their section and only whole sections reach the prompt.

```text
content/jtb/*.md
      │  lib/jtb/knowledge-base.ts — read files, strip "[TODO: James" lines,
      │                             keep per-section {section, content}
      ▼
app/api/jtb/route.ts — after the auth → validate → credit pre-check → rate-limit
      │                gates of §5.1:
      │
      ├─ lib/jtb/retrieval.ts — embed(message) via the jtb-embed Supabase Edge
      │      Function (lib/jtb/embeddings.ts, user's access token) → RPC
      │      match_jtb_chunks (pgvector cosine, top-12 chunks) → max-pool chunk
      │      scores to sections → keep sections ≥ RETRIEVAL_MIN_SIMILARITY (0.81)
      │      → top-4
      │
      ├─ ok              → context = whole sections from the loader
      └─ any failure     → context = whole KB (the pre-RAG behaviour)
      │      (lib/jtb/knowledge-base.ts formatKnowledgeBaseSections frames
      │       both identically: `## ${section}\n\n${content}`)
      ▼
lib/jtb/prompt.ts — buildSystemPrompt(context) → POST /api/chat (Ollama cloud)
```

The prompt builder knows nothing about retrieval, and `lib/jtb/turn.ts` rebuilds the context **from the loader**, never from stored chunk text — so a retrieved prompt is byte-identical to the same sections inside the whole-KB string, and a stale index row can never leak old text into a prompt.

## The fallback is load-bearing

`retrieveContext` never throws. Every failure degrades to whole-KB stuffing — the exact pre-RAG behaviour — so retrieval can only cost tokens, never the reply. Failure reasons (recorded in `chat_interactions.request_metadata.retrievalReason`):

| Reason | Trigger |
| --- | --- |
| `embed_failed` | the edge-function embed throws, times out, or returns a malformed/empty vector |
| `rpc_failed` | the `match_jtb_chunks` RPC errors |
| `no_rows` | table empty — the KB index was never synced (`npm run kb:sync`) |
| `below_threshold` | best section similarity < 0.81 (expected for off-topic messages; not logged) |
| `model_mismatch` | stored vectors were embedded by a different model than the query embedder |

Only a genuinely unreadable KB — `loadKnowledgeBaseSections()` returning null — still produces the `kb_unavailable` 503, and that gate runs **before** retrieval, so retrieval can never mask a broken KB. Credit semantics are untouched: one credit deducted only after a successful LLM response, and `kb_unavailable` deducts nothing.

## Embeddings are a Supabase Edge Function

Both embed and chat run against Supabase/Ollama over HTTPS, so **retrieval works identically in `npm run dev` and on Vercel** — no localhost dependency, no dev/production split.

- **Embeddings:** `supabase/functions/jtb-embed` (Deno) hosts `supabase.ai` `gte-small` — 384 dims, L2-normalized, deployed with `verify_jwt: true`. `lib/jtb/embeddings.ts` is the only intended caller. The function additionally checks the JWT `role` claim (`authenticated`/`service_role`), so an anon key — a valid JWT, but role=anon — is refused (403) and cannot burn inference. Request path calls carry the user's access token; `npm run kb:sync` carries the service key (which never leaves `.env.local`).
- **Chat:** still Ollama Cloud (`lib/jtb/llm.ts`, model `gpt-oss:120b`). Chat and embeddings are different providers by design — the edge function is the embeddings host that is reachable from Vercel.

**The 546 CPU kill (discovered 2026-08-28):** an edge-function invocation is killed with HTTP 546 past ~2.4s of inference (~0.4s per 1500-char input), so a naive "embed all 15 chunks in one request" 503s. `embedTexts` therefore sub-batches — each HTTP request carries at most 4 inputs / 4000 chars and gets a fresh invocation budget — and concatenates. Latency stays fine: ~0.2–0.4s per sub-request.

**Threshold calibration (the go/no-go gate):** raw gte-small had a gap of 0.059 between the worst on-topic score and the best off-topic score, and education questions were outranked by `career.md` (top-4 precision 14/16). Two fixes closed the gate:
- **Per-section prefix** (`lib/jtb/chunking.ts`): every chunk is embedded and stored as `Information about James Imbuido's ${topic}.` + body. gte-small's baseline similarity for any two English texts is ~0.7+, so an unanchored chunk of any section scores near everything; the prefix lifts the on-topic/off-topic gap to **0.074** and top-4 precision to **16/16**.
- **Threshold 0.81** sits mid-gap (on-topic floor 0.845, off-topic ceiling 0.771). This replaces the qwen3-era 0.38 — the scales are not comparable.

The migration also changed the storage shape: the old one-row-per-section table is now **chunk-level** (`supabase/migrations/20260829100000_jtb_chunks_subchunk_gte_small.sql`) — `jtb_chunks` with composite PK `(section, chunk_index)`, `vector(384)`, and a chunk-level `match_jtb_chunks(p_query_embedding, p_match_count default 12)` SECURITY DEFINER RPC (authenticated only, `auth.uid()` guard, RLS zero policies). `RETRIEVAL_MATCH_COUNT` (12) must exceed `RETRIEVAL_TOP_K` (4) because the top chunks can all belong to one section; pooling collapses them back to sections before the top-k cut.

## Keeping the index in sync

The `jtb_chunks` table is a **snapshot** of `content/jtb/`, written only by the offline sync script (service-role key, James's machine — never in Vercel, never imported from `app/` or `lib/`):

```sh
npm run kb:sync              # chunk + embed new/changed sections, replace their rows
npm run kb:sync -- --check   # drift report only; exit 1 when out of date
```

**After editing any `content/jtb/` file, run `npm run kb:sync`.** Until you do, retrieval serves the previous text while the whole-KB fallback would serve the new — a stale-content window that didn't exist before RAG. Drift is measured per whole section (`content_hash` over exactly the bytes the loader injects), so any edit registers; sync re-chunks and re-embeds only the changed sections, then deletes + reinserts their chunk rows (chunk counts can shrink, so changed sections are replaced, not upserted). A changed `DEFAULT_EMBEDDING_MODEL` re-embeds everything. Filling a placeholder section (e.g. `projects`, `faq`) and syncing is all it takes to bring it into retrieval.

Because prompts are always rebuilt from the loader, a stale index only degrades *which* sections get retrieved — it can never serve outdated text.

## Key files

- `app/api/jtb/route.ts` — the server flow (auth → credits → rate limit → validate → KB gate → retrieve → LLM → deduct → record), incl. the `match_jtb_chunks` RPC closure and the session-token handoff to `embedTexts`.
- `lib/jtb/retrieval.ts` — the never-throw retrieval policy (pooling, threshold, top-k, failure reasons).
- `lib/jtb/embeddings.ts` — the edge-function embed client (sub-batching, shape validation, timeouts).
- `lib/jtb/chunking.ts` — deterministic section → chunk splitter with the calibrated section prefix.
- `lib/jtb/knowledge-base.ts` — per-section loader + `formatKnowledgeBaseSections` (the one framing owner).
- `lib/jtb/llm.ts` — `completeChat` (Ollama Cloud, chat only).
- `lib/jtb/constants.ts` — `RETRIEVAL_TOP_K`/`RETRIEVAL_MATCH_COUNT`, `RETRIEVAL_MIN_SIMILARITY`, `EMBEDDING_DIM`, model defaults.
- `scripts/kb-sync.ts` — the only service-role client; chunks, embeds, and replaces the index.
- `supabase/functions/jtb-embed/index.ts` — the embeddings edge function (role-checked, gte-small).
- `supabase/migrations/20260829100000_jtb_chunks_subchunk_gte_small.sql` — chunk-level pgvector table + SECURITY DEFINER `match_jtb_chunks` (authenticated only, `auth.uid()` guard, RLS zero policies).
- `content/jtb/*.md` — the approved grounding content (source of truth for both retrieval and fallback).