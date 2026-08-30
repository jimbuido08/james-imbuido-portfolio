-- Authoritative rate-limit gate inside claim_chess_reward — §21's "never
-- trust the client" applied to the limiter itself. The route's pre-check
-- (lib/chess/claim.ts countRecentAttempts → recordAttempt) is clean-429 UX;
-- a caller invoking this RPC directly with the publishable key is still
-- bounded, mirroring record_contact_message in the contact migration.
--
-- 10 / 60s pairs with lib/chess/constants.ts RATE_LIMIT_MAX_ATTEMPTS /
-- RATE_LIMIT_WINDOW_MS. The comparison is > (not >=) the max because the
-- route records the current attempt BEFORE calling this RPC, so v_count
-- includes it — matching the pre-check's "refuse when earlier attempts
-- already reach the max" semantics. Returns claimed=false with
-- rateLimited=true; claim.ts maps that to the rate_limited outcome.
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
  v_attempts integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select count(*)::int into v_attempts
  from public.chess_claim_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '60 seconds';

  if v_attempts > 10 then
    return jsonb_build_object('claimed', false, 'rateLimited', true);
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