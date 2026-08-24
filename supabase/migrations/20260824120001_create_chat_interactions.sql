-- PHASE 5: per-user JTB usage tracking (Phase 6 writes rows server-side).
create table public.chat_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  request_metadata jsonb,
  response_metadata jsonb
);

create index chat_interactions_user_id_idx on public.chat_interactions (user_id);

alter table public.chat_interactions enable row level security;

create policy "chat_interactions_select_own"
  on public.chat_interactions for select
  using (auth.uid() = user_id);

create policy "chat_interactions_insert_own"
  on public.chat_interactions for insert
  with check (auth.uid() = user_id);
