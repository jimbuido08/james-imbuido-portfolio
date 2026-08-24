-- PHASE 5: one-time rewards. unique(user_id, reward_type) is the once-per-user
-- gate the chess reward (reward_type = 'chess') relies on in Phase 7.
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_type text not null,
  credits_awarded integer not null,
  created_at timestamptz not null default now(),
  metadata jsonb,
  unique (user_id, reward_type)
);

create index rewards_user_id_idx on public.rewards (user_id);

alter table public.rewards enable row level security;

create policy "rewards_select_own"
  on public.rewards for select
  using (auth.uid() = user_id);

create policy "rewards_insert_own"
  on public.rewards for insert
  with check (auth.uid() = user_id);
