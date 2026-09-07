-- VOICE CLONING: one-time +2 JTB interaction reward for trying /voice.
-- Mirrors the chess reward (20260825120000 + 20260825120001 +
-- 20260830120000) as a single migration, with two deliberate differences:
--
--  1. The request body is EMPTY. Synthesis runs entirely in the visitor's
--     browser (device-only consent guardrail), so there is nothing to
--     verify server-side — no moves to replay, no audio to inspect. The
--     server's authority is the once-per-user gate and the rate limit; the
--     client proves nothing and the route accepts no payload that could
--     carry a fabricated claim.
--  2. The reward is for *trying* the feature, not for winning — so no
--     verification stage exists between the rate gate and the award.
--
-- The rate gate is baked into the RPC (authoritative SQL-side, mirroring
-- rate_gate_chess_claim): a caller invoking this function directly with the
-- publishable key is still bounded. 10/60s pairs with lib/voice/claim.ts's
-- RATE_LIMIT constants; comparison is > (not >=) because the route records
-- the current attempt BEFORE calling this RPC, so v_count includes it.
--
-- unique(user_id, reward_type) on public.rewards remains the enforcement
-- boundary: the +2 credit update and voice_reward_claimed flag land in the
-- same transaction as the reward row. SECURITY DEFINER (owner bypasses RLS)
-- mirrors claim_chess_reward; the caller must equal auth.uid().

alter table public.profiles
  add column if not exists voice_reward_claimed boolean not null default false;

create table public.voice_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index voice_claim_attempts_user_id_idx on public.voice_claim_attempts (user_id);

alter table public.voice_claim_attempts enable row level security;

create policy "voice_claim_attempts_select_own"
  on public.voice_claim_attempts for select
  using (auth.uid() = user_id);

create policy "voice_claim_attempts_insert_own"
  on public.voice_claim_attempts for insert
  with check (auth.uid() = user_id);

create or replace function public.claim_voice_reward(
  p_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_reward_id uuid;
  v_remaining integer;
  v_attempts integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select count(*)::int into v_attempts
  from public.voice_claim_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '60 seconds';

  if v_attempts > 10 then
    return jsonb_build_object('claimed', false, 'rateLimited', true);
  end if;

  insert into public.rewards (user_id, reward_type, credits_awarded, metadata)
  values (p_user_id, 'voice', 2, coalesce(p_metadata, '{}'::jsonb))
  on conflict (user_id, reward_type) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    -- Already claimed: no credit change.
    return jsonb_build_object('claimed', false, 'creditsRemaining', null);
  end if;

  update public.profiles
  set credits_remaining = credits_remaining + 2,
      voice_reward_claimed = true
  where id = p_user_id
  returning credits_remaining into v_remaining;

  return jsonb_build_object('claimed', true, 'creditsRemaining', v_remaining);
end;
$$;

revoke execute on function public.claim_voice_reward(uuid, jsonb) from public, anon;
grant execute on function public.claim_voice_reward(uuid, jsonb) to authenticated;