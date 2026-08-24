-- PHASE 7: atomic one-time chess reward (+5 JTB interactions).
-- app/api/chess authenticates, replays the submitted game, and verifies a
-- genuine checkmate win BEFORE calling this function; this function is the
-- authoritative once-per-user gate: unique(user_id, reward_type) on
-- public.rewards is the enforcement boundary, and the +5 credit update +
-- chess_reward_claimed flag land in the same transaction as the reward row.
-- SECURITY DEFINER (owner bypasses RLS) mirrors public.deduct_credit; the
-- caller must equal auth.uid() so no user can award another. The reward size
-- and type are hard-coded here precisely so the client cannot choose them.

create or replace function public.claim_chess_reward(
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  insert into public.rewards (user_id, reward_type, credits_awarded, metadata)
  values (p_user_id, 'chess', 5, coalesce(p_metadata, '{}'::jsonb))
  on conflict (user_id, reward_type) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    -- Already claimed: no credit change.
    return jsonb_build_object('claimed', false, 'creditsRemaining', null);
  end if;

  update public.profiles
  set credits_remaining = credits_remaining + 5,
      chess_reward_claimed = true
  where id = p_user_id
  returning credits_remaining into v_remaining;

  return jsonb_build_object('claimed', true, 'creditsRemaining', v_remaining);
end;
$$;

revoke execute on function public.claim_chess_reward(uuid, jsonb) from public, anon;
grant execute on function public.claim_chess_reward(uuid, jsonb) to authenticated;
