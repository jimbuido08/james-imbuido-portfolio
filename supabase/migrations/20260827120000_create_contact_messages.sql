-- Contact form storage — §22: "simple contact form ... server-side route".
--
-- Clients may never read or write this table: the publishable key is public,
-- so an anon insert policy would bypass the route's rate limit and honeypot
-- entirely. RLS is enabled with zero policies (James reads via the dashboard);
-- the route writes through the SECURITY DEFINER functions below, mirroring
-- 20260824120003_harden_jtb_credits.sql.
--
-- ip_hash is a salted SHA-256 of the client IP — the raw IP is never stored.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index contact_messages_ip_hash_created_at_idx
  on public.contact_messages (ip_hash, created_at desc);

alter table public.contact_messages enable row level security;

-- Cheap pre-check for the route's clean 429 UX; the authoritative gate is the
-- limit check inside record_contact_message, so direct RPC calls with the
-- public key are still bounded. (A plain select would return 0 — no read policy.)
create or replace function public.count_recent_contact_messages(
  p_ip_hash text,
  p_since timestamptz
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.contact_messages
  where ip_hash = p_ip_hash
    and created_at >= p_since;
$$;

-- Insert one message, enforcing the per-IP rate limit authoritatively in the
-- same transaction as the insert. Returns false when the caller is over the
-- limit. The 5 / 1 hour pair mirrors RATE_LIMIT_MAX_MESSAGES / WINDOW_MS in
-- lib/contact/constants.ts, the way claim_chess_reward's limits pair with
-- lib/credits/constants.ts.
create or replace function public.record_contact_message(
  p_name text,
  p_email text,
  p_message text,
  p_ip_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*)::int into v_count
  from public.contact_messages
  where ip_hash = p_ip_hash
    and created_at >= now() - interval '1 hour';

  if v_count >= 5 then
    return false;
  end if;

  insert into public.contact_messages (name, email, message, ip_hash)
  values (p_name, p_email, p_message, p_ip_hash);

  return true;
end;
$$;

revoke execute on function public.count_recent_contact_messages(text, timestamptz) from public;
revoke execute on function public.record_contact_message(text, text, text, text) from public;
grant execute on function public.count_recent_contact_messages(text, timestamptz) to anon, authenticated;
grant execute on function public.record_contact_message(text, text, text, text) to anon, authenticated;