-- Authoritative rate-limit gate inside deduct_credit — §21's "never trust the
-- client" applied to the limiter itself. The route's pre-check
-- (lib/jtb/turn.ts countRecentAttempts) is clean-429 UX; a caller invoking
-- this RPC directly with the publishable key is still bounded, mirroring
-- record_contact_message in the contact migration.
--
-- 10 / 60s pairs with lib/jtb/constants.ts RATE_LIMIT_MAX_MESSAGES /
-- RATE_LIMIT_WINDOW_MS. The comparison is >= the max because the current
-- request's chat_interactions row is written AFTER the deduct, so v_count
-- covers only prior attempts — matching the pre-check's semantics.
--
-- The return changes integer → jsonb to carry the refusal, so the function is
-- dropped and recreated (Postgres cannot alter a return type in place):
--   { "rateLimited": true }                      — authoritative gate refused
--   { "creditsRemaining": n | null }             — the previous integer/null
drop function public.deduct_credit(p_user_id uuid);

create or replace function public.deduct_credit(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_remaining integer;
  v_recent integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select count(*)::int into v_recent
  from public.chat_interactions
  where user_id = p_user_id
    and created_at >= now() - interval '60 seconds';

  if v_recent >= 10 then
    return jsonb_build_object('rateLimited', true);
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - 1
  where id = p_user_id and credits_remaining > 0
  returning credits_remaining into v_remaining;

  if not found then
    return jsonb_build_object('creditsRemaining', null); -- out of credits
  end if;

  return jsonb_build_object('creditsRemaining', v_remaining);
end;
$$;

-- Recreate the use grants (dropping the function dropped its grants).
revoke execute on function public.deduct_credit(uuid) from public, anon;
grant execute on function public.deduct_credit(uuid) to authenticated;