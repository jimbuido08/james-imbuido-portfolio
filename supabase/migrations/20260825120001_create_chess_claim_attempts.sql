-- PHASE 8: per-user chess claim attempt tracking. A row is written best-effort
-- on every POST /api/chess (win or not), so the rate limiter counts attempts,
-- not just successful claims — a user hammering the endpoint can't hide behind
-- failed games. Mirrors chat_interactions for the JTB limiter.
create table public.chess_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index chess_claim_attempts_user_id_idx on public.chess_claim_attempts (user_id);

alter table public.chess_claim_attempts enable row level security;

create policy "chess_claim_attempts_select_own"
  on public.chess_claim_attempts for select
  using (auth.uid() = user_id);

create policy "chess_claim_attempts_insert_own"
  on public.chess_claim_attempts for insert
  with check (auth.uid() = user_id);
