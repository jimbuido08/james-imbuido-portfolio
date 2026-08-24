# JTB grounding architecture — prompt-stuffing, not RAG

**Status:** current behaviour (Phase 6, V1). Written 2026-08-24.

## What JTB actually does

JTB does **not** use Retrieval-Augmented Generation (RAG). It grounds answers by stuffing the **entire knowledge base** into the system prompt on every request:

```text
content/jtb/*.md
      │  lib/jtb/knowledge-base.ts — read files, strip "[TODO: James" lines,
      │                             concatenate all sections into one string
      ▼
lib/jtb/prompt.ts — buildSystemPrompt(KB)  →  system prompt = rules + <knowledge-base>…</knowledge-base>
      │
      ▼
app/api/jtb/route.ts → lib/jtb/llm.ts → POST {OLLAMA_BASE_URL}/api/chat with that prompt
```

There is **no retrieval step**: no embeddings, no vector store, no chunking, no query-time relevance filtering. Every question sends the same fixed KB (~15 KB as of 2026-08-24, 7 of 10 sections populated).

## Why this is the right call for V1

- **Simple and deterministic** — one markdown source of truth (§7), no retrieval failure modes, no embedding pipeline to maintain.
- **Zero infrastructure** — fits the existing server-only stack; the Ollama call is the only moving part.
- **Small enough to stuff** — ~15 KB is well within context; cost and latency are acceptable.
- **Security invariants unaffected** — the KB still lives server-side; the API key still never reaches the browser (§21).

## When to revisit

Prompt-stuffing degrades as the KB grows (projects, visualisations, FAQ, more certifications): every request pays to send everything, and the model's attention dilutes. Revisit when the KB is materially larger or when reply latency/token cost matters.

## What a RAG upgrade would look like

If we move to retrieval, the natural shape (fits the existing server-only architecture):

1. A `pgvector` table on the hosted Supabase project; chunk each `content/jtb/` file per section and store an embedding per chunk.
2. At request time, embed the user's message and retrieve the top-N most relevant sections.
3. Inject only those into the system prompt, instead of the whole KB.

The credit/auth/rate-limit flow in `app/api/jtb/route.ts` (§5.1) would stay unchanged; only the KB-loading step inside `loadKnowledgeBase()` (or its caller) becomes retrieval-aware. See the master plan §5.1, §7 and §21 for the constraints that still apply.

## Key files

- `app/api/jtb/route.ts` — the server flow (auth → credits → rate limit → validate → KB → LLM → deduct → record).
- `lib/jtb/knowledge-base.ts` — the whole-KB loader (the one function a RAG change would touch).
- `lib/jtb/prompt.ts` — system-prompt builder that embeds the KB.
- `content/jtb/*.md` — the approved grounding content.
