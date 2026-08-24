-- PHASE 6: server-controlled credits for JTB.
-- 1) Column-level lock: authenticated may only UPDATE employment_status.
--    RLS policy "profiles_update_own" stays and now governs that one column.
revoke update on table public.profiles from authenticated, anon;
grant select on table public.profiles to authenticated;
grant update (employment_status) on table public.profiles to authenticated;

-- 2) Clients may no longer forge usage/audit or reward rows; the server
--    writes them via SECURITY DEFINER functions below.
drop policy if exists "chat_interactions_insert_own" on public.chat_interactions;
drop policy if exists "rewards_insert_own" on public.rewards;

-- 3) Atomic credit deduction: one conditional UPDATE both enforces (>0) and
--    deducts exactly 1 — race-safe. Empty search_path mirrors handle_new_user().
create or replace function public.deduct_credit(p_user_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_remaining integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - 1
  where id = p_user_id and credits_remaining > 0
  returning credits_remaining into v_remaining;

  if not found then
    return null; -- out of credits; caller treats as exhausted
  end if;

  return v_remaining;
end;
$$;

-- 4) Server-side usage insert (metadata only, never message content).
create or replace function public.record_chat_interaction(
  p_user_id uuid,
  p_request_metadata jsonb,
  p_response_metadata jsonb
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  insert into public.chat_interactions (user_id, request_metadata, response_metadata)
  values (p_user_id, p_request_metadata, p_response_metadata);
end;
$$;

-- 5) Tighten execution grants (functions are PUBLIC-executable by default).
revoke execute on function public.deduct_credit(uuid) from public, anon;
revoke execute on function public.record_chat_interaction(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.deduct_credit(uuid) to authenticated;
grant execute on function public.record_chat_interaction(uuid, jsonb, jsonb) to authenticated;
