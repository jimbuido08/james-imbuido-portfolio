-- PHASE 5: profiles (auth-user mirror). Credits + chess-reward flags are Phase 5
-- schema only; Phases 6 (JTB credits) and 7 (chess reward) consume them.
-- auth.users is owned by Supabase Auth — never altered here.
-- RLS at the bottom: a user can only ever SELECT/UPDATE their own row.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employment_status text,
  credits_remaining integer not null default 10 check (credits_remaining >= 0),
  chess_reward_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_employment_status_check
  check (
    employment_status is null
    or employment_status in (
      'Student',
      'Seeking opportunities / unemployed',
      'Employed',
      'Employer / recruiter / hiring manager',
      'Other',
      'Prefer not to say'
    )
  );

-- Seed a profile row the moment a user signs up. SECURITY DEFINER + empty
-- search_path means the trigger inserts without needing an INSERT policy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, employment_status, credits_remaining, chess_reward_claimed)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'employment_status', ''),
    10,
    false
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bump updated_at on profile changes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Row Level Security: clients can only ever see/edit their own row.
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
