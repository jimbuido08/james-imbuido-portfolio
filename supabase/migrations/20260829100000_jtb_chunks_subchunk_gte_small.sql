-- JTB retrieval (§7), subchunk + gte-small edition. Replaces the Phase-1
-- one-row-per-section table (20260828120000): gte-small silently truncates at
-- 512 tokens, and whole sections overflow it (experience.md ≈ 1.5k tokens),
-- so each section is now stored as one or more chunks (### -level, packed to
-- ≤ 1600 chars by lib/jtb/chunking.ts). Embeddings come from the jtb-embed
-- Edge Function (supabase.ai gte-small, 384 dims) — reachable from Vercel, so
-- retrieval runs in production too, not just dev.
--
-- Chunks are a storage detail: match_jtb_chunks returns chunk-level rows and
-- lib/jtb/retrieval.ts max-pools scores back to section level; the prompt is
-- always rebuilt from whole sections (lib/jtb/knowledge-base.ts), so stored
-- fragments can never leak into a prompt. content_hash stays a WHOLE-section
-- hash — the drift unit for `npm run kb:sync` — so a section edit re-embeds
-- all of its chunks.
--
-- Clients may never read this table directly: reads go through the SECURITY
-- DEFINER match_jtb_chunks (granted to authenticated only), keeping the corpus
-- inside the auth/credit/rate-limit flow of §5.1. RLS enabled, zero policies —
-- mirrors contact_messages in 20260827120000. Writes happen offline via
-- scripts/kb-sync.ts with the service-role key, which bypasses RLS.
--
-- vector(384) must equal EMBEDDING_DIM in lib/jtb/constants.ts (gte-small,
-- verified 2026-08-28 against the deployed jtb-embed function); a model or
-- dimension change means a new migration + full re-embed (npm run kb:sync).

drop function if exists public.match_jtb_chunks(extensions.vector(4096), integer);
drop table if exists public.jtb_chunks;

create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated;

create table public.jtb_chunks (
  section text not null,
  chunk_index integer not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(384) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (section, chunk_index)
);

alter table public.jtb_chunks enable row level security;

-- Rank and cut at the CHUNK level — returns top-k chunk rows + scores, NO
-- threshold and NO pooling on purpose: the threshold and the max-pool back to
-- sections are policy and live in lib/jtb/retrieval.ts (whose miss falls back
-- to the whole KB), so below-threshold similarity stays observable in
-- chat_interactions telemetry.
create or replace function public.match_jtb_chunks(
  p_query_embedding extensions.vector(384),
  p_match_count integer default 12
)
returns table (
  section text,
  chunk_index integer,
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
  -- Cosine similarity = 1 - cosine distance; gte-small embeddings are
  -- L2-normalized, so this is a plain dot product.
  return query
    select
      c.section,
      c.chunk_index,
      c.content,
      (1 - (c.embedding OPERATOR(extensions.<=>) p_query_embedding))::double precision as similarity,
      c.embedding_model
    from public.jtb_chunks c
    order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
    limit p_match_count;
end;
$$;

revoke execute on function public.match_jtb_chunks(extensions.vector(384), integer) from public, anon;
grant execute on function public.match_jtb_chunks(extensions.vector(384), integer) to authenticated;