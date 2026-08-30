---
title: "JTB — James Talks Back"
category: LLM
description: "An auth-gated RAG chatbot grounded exclusively in a curated knowledge base about James — per-section pgvector retrieval with a guaranteed whole-KB fallback, credit-metered access, and no credit charged when a reply fails. Sign in to chat."
featured: true
interactive: true
technologies:
  - Next.js
  - TypeScript
  - Next.js server routes
  - Supabase Auth
  - Postgres
  - pgvector
  - Supabase Edge Functions
  - gte-small embeddings
  - Ollama
  - Deno
problem: "A chatbot about a real person will happily invent a job title, an employer, or a metric, so grounding has to be a system property rather than a prompt instruction — the only source the model should ever see is markdown James has approved. Separately, an open chat burns LLM spend: access must be metered by the account, never by what the browser reports, and anonymous visitors must not be able to consume credits at all."
data: "The knowledge base is nine markdown files under content/jtb/ (about, experience, education, skills, projects, ml, ai, career, faq), seven of which currently carry real content while the rest still hold placeholder lines. The loader is fail-closed: it strips placeholder lines, and if nothing readable is left it returns null rather than half-grounded text. Sections are split at heading boundaries because the gte-small encoder truncates at 512 tokens — chunks are a storage detail only, and prompts always receive whole sections."
models: "Nothing was trained or fine-tuned; grounding is done entirely by context. The query encoder is the gte-small model hosted in a purpose-built Supabase Edge Function (384 dims, L2-normalized, JWT-role-checked) and the generator is Ollama Cloud. Per message, pgvector cosine similarity returns the top-12 chunks, chunk scores are max-pooled back to their sections, and the top-4 sections scoring at least 0.81 are injected whole — never the raw chunks."
evaluation: "Retrieval was calibrated against a small hand-built query set, not a public benchmark: raw gte-small answered education questions with the wrong section (top-4 precision 14/16) with only a 0.059 gap between the worst on-topic and best off-topic score. Storing a per-section prefix ('Information about James Imbuido's <topic>.') with every chunk widened the gap to 0.074 and raised precision to 16/16; the 0.81 threshold sits mid-gap (on-topic floor 0.845, off-topic ceiling 0.771). Generation is evaluated behaviourally — on what gets credited and what does not — rather than with a score."
approach: "A fixed server-side gate order: authenticate, validate, pre-check credits, rate-limit, then the knowledge-base gate, then retrieval, then generation. Retrieval is built to degrade rather than fail: an embed timeout, an RPC error, an unsynced index, or a below-threshold query all fall back to stuffing the entire knowledge base, byte-identical to the per-section prompt because the context is rebuilt from the loader, never from stored chunk text. The credit row is decremented only after a successful model response, so a failed turn costs the user nothing. Embeddings sub-batch through the edge function (at most 4 inputs / 4000 chars per HTTP request) after it turned out an invocation is CPU-killed at HTTP 546 past roughly 2.4 seconds of inference."
results: "Verified end-to-end against the hosted project: a signed-in user receives a grounded reply and exactly one credit is deducted; a failing LLM call deducts nothing; unauthenticated calls are refused; an embed or retrieval failure still returns a reply over whole-KB context; and only an unreadable knowledge base yields the kb_unavailable failure — before retrieval is even attempted, with no credit charged. Answers are limited to what the approved markdown supports, which is the point."
lessons: "Fail-closed beats fail-loud: because retrieval can never throw, it can only cost tokens, never the reply, so shipping it carried no risk to the behaviour that already worked. Sorting by section rather than by chunk matters more than the chunking itself — embeddings are a storage detail and prompts want whole sections. Serverless inference budgets turn sub-batch sizing into a correctness constraint, not an optimisation. And the grounding boundary is only as strong as the file list behind it: a placeholder section in the knowledge base is a question JTB must decline, which is the honest failure mode."
demoUrl: "/jtb"
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->