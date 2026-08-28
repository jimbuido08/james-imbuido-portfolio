-- JTB retrieval (§7): one row per content/jtb/ section, embedded by the local
-- Ollama model named in embedding_model. A chunk is the whole file body with
-- placeholder lines stripped — exactly the text lib/jtb/knowledge-base.ts
-- injects — so a retrieved context and the whole-KB prompt are framed
-- identically and buildSystemPrompt() knows about neither.
--
-- Clients may never read this table directly: reads go through the SECURITY
-- DEFINER match_jtb_chunks (granted to authenticated only), keeping the corpus
-- inside the auth/credit/rate-limit flow of §5.1. RLS enabled, zero policies —
-- mirrors contact_messages in 20260827120000. Writes happen offline via
-- scripts/kb-sync.ts with the service-role key, which bypasses RLS.
--
-- vector(4096) must equal EMBEDDING_DIM in lib/jtb/constants.ts (probed
-- 2026-08-28: the qwen3-embedding Ollama default tag is the 8B, 4096 dims);
-- a model or dimension change means a new migration + full re-embed
-- (npm run kb:sync).
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated;

create table public.jtb_chunks (
  section text primary key,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(4096) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exact scan is correct and fastest at one row per file (7 today). Add an HNSW
-- index only if the section count reaches the hundreds:
--   create index jtb_chunks_embedding_idx
--     on public.jtb_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.jtb_chunks enable row level security;

-- Rank and cut — returns top-k + scores, NO threshold filter on purpose: the
-- threshold is policy and lives in lib/jtb/retrieval.ts (whose miss falls back
-- to the whole KB), so below-threshold similarity is still observable in
-- chat_interactions telemetry.
create or replace function public.match_jtb_chunks(
  p_query_embedding extensions.vector(4096),
  p_match_count integer default 4
)
returns table (
  section text,
  content text,
  similarity double precision,
  embedding_model text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Reads belong to the auth-gated flow only (§5.1). Mirrors deduct_credit's
  -- guard; fails loudly (42501) rather than silently returning zero rows.
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- OUT params shadow unqualified columns in plpgsql, and with
  -- search_path = '' the pgvector operator must be schema-qualified.
  -- Cosine similarity = 1 - cosine distance; Ollama embeddings are
  -- L2-normalized, so this is a plain dot product.
  return query
    select
      c.section,
      c.content,
      (1 - (c.embedding OPERATOR(extensions.<=>) p_query_embedding))::double precision as similarity,
      c.embedding_model
    from public.jtb_chunks c
    order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
    limit p_match_count;
end;
$$;

revoke execute on function public.match_jtb_chunks(extensions.vector(4096), integer) from public, anon;
grant execute on function public.match_jtb_chunks(extensions.vector(4096), integer) to authenticated;