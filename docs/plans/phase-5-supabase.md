# PHASE 5 — SUPABASE AUTH: Implementation Plan

> Executor: you are implementing **Phase 5 (Supabase auth)** of a Next.js portfolio, in **two milestones (A then B), each ending in one conventional commit**. Follow this document exactly. Do not invent features, routes, or dependencies. Do not touch 3D files (`components/universe/`, `lib/universe/`), `app/page.tsx`, `app/design/page.tsx`, `app/chess/*`, `app/about|experience|ai-ml|data|contact/*`, `lib/chess/`, `lib/content/`, or anything built in Phases 1–4 — all out of scope. If you run low on budget, complete and commit Milestone A and stop; A is self-standing (schema + clients live on the real Supabase project, and nothing in B depends on more than A's files).
>
> You have a live, already-created Supabase project and a **Supabase MCP server** connected to this session (documented in §4.1) — use it for applying migrations, inspecting schema, running security advisors, and generating TypeScript types. The CLI/local-Docker stack is NOT required this phase.

## 1. Context

Phases 1–4 delivered the design system, the 3D Data Universe, the conventional portfolio, and the playable chess UI with a client-side opponent. Phase 5 per master plan §28 and CLAUDE.md ("Next up: Phase 5 — Supabase auth per §34") builds the account system that the remaining phases hang off: **Supabase email/password auth (SSR), a `profiles` table mirroring `auth.users`, RLS on all user data, a 10-credit starting balance, and the schema home for usage tracking and rewards.** Authoritative spec sections: §4 (auth), §4.1 (registration fields: email, password, employment status only), §4.2 (Supabase's current SSR auth pattern — use it verbatim, never hand-roll passwords), §4.3 (auth.users → profiles), §5 (usage: 10 credits, chat_interactions, rewards), §21 (security invariants), §28 Phase 5, §32 (definition of done), §34 (build order). §5.1 credit *spending* (JTB), §7/§3.7 chess-reward *verification and award*, and the `/jtb` chat are **Phases 6–7** and are explicitly NOT built here — but the schema and the auth plumbing they need ARE.

**The one thing you must understand before writing a line:** this repo's `auth/users` belong to Supabase; the portfolio's own data lives in `public.profiles` (one row per user, seeded by a trigger), `public.chat_interactions` (usage tracking), and `public.rewards` (one-time awards, once per user). Every table is locked down with Row Level Security so a user can only ever touch their own rows (§21). The UI is three pages (`/login`, `/signup`, `/account`) plus a tiny email-confirmation route. There is no social login, no admin, no password reset flow, no "forgot password", no role system in V1 (§29) — do not add them.

### Hard rules (violating any of these = failed milestone)

1. **Exactly two new dependencies, both in Milestone A: `@supabase/ssr` and `@supabase/supabase-js`** (peer). Do NOT install `@supabase/auth-ui-*`, `zod`, `bcrypt`, `next-auth`, `@auth/*`, `nodemailer`, or anything else. Password hashing is Supabase's job.
2. **Design tokens only.** No hex codes, no `zinc-*`/`gray-*`/`slate-*` utilities. Field styling copies the `fieldClasses` constant from `app/contact/page.tsx`. Error text uses `text-accent-exp` (the repo's muted-rose warning token, already used for "in check" in Phase 4). Forms mirror the contact page's markup exactly (label `block text-sm text-fg-muted`, input `mt-2 w-full …`).
3. **Strict TypeScript, no `any`.** `npm run build` must type-check clean. Do NOT annotate components with `JSX.Element` (React 19 removed the global `JSX` namespace); let return types be inferred. Do not use `role="alert"` on a `<p>` you also render normally — render it conditionally.
4. **This is NOT the Next.js you know (§ next).** `middleware.ts` is deprecated and renamed to `proxy.ts` (verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`): create `proxy.ts` at the repo root exporting a named `proxy` function (or default), plus `export const config = { matcher: […] }`. `cookies()` is async — `await cookies()`. Server actions + React 19's `useActionState` for forms (Next 16's own guide does exactly this).
5. **Keep every existing `.gitkeep`** — including `lib/supabase/.gitkeep`, `lib/validation/.gitkeep`, `supabase/migrations/.gitkeep` — even after adding real files to those directories.
6. **Security invariants (§21):** the auth pages gate by `auth.getUser()`/`auth.getClaims()` and `redirect()`; never trust a browser-provided user ID anywhere; RLS is the enforcement boundary; `.env.local` holds real secrets and is git-ignored (the `.env.example` in-repo stays placeholder-only). Employment status is audience analytics — **it must never gate a feature or appear to**.
7. **Honesty rule:** no fabricated account data. The `/account` page shows real DB values (defaults: 10 credits, reward unclaimed) and states plainly that JTB and the chess reward activate in later phases. No "welcome bonus" copy, no invented perks.
8. **No `Math.random()` during render or in `useState`/`useActionState` initializers** — initial state must be deterministic (SSR/CSR hydration).

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TS strict, Tailwind v4 CSS-first (all config in `app/globals.css`; no `tailwind.config.*`). `@/*` → repo root. npm only. No test framework by design. Prettier ignores `*.md` so this document is never format-checked.
- **No Supabase packages installed** (`npm ls @supabase/ssr @supabase/supabase-js` → empty). **No `proxy.ts` or `middleware.ts` exists** at root or `src/`.
- `lib/supabase/` and `lib/validation/` each contain only a `.gitkeep` — they exist to receive this phase's work. `lib/content/` already has real `filters.ts`/`projects.ts` (Phase 3) — do not touch. `supabase/migrations/` contains only `.gitkeep`.
- `types/` contains `chess.ts` and `project.ts`. You will add `types/supabase.ts` (generated, not hand-written).
- UI primitives: `Container`, `SectionHeading({kicker?, title, description?, as?, className?})`, `Button({variant?: "primary"|"secondary"|"ghost", size?: "sm"|"md"|"lg", href?, …})` — with `href` it renders a Link; use the no-`href` `<button>` path for `onClick`/`disabled`. `cx(...)` from `@/lib/utils`. Header nav lives in `components/navigation/Header.tsx` (`navLinks` const array, desktop + mobile).
- The **Supabase project already exists** (created for this repo): **project ref `pzuypkxbthxevdlqynqw`, name `james-imbuido-portfolio`**, Postgres 17, region ap-southeast-2, URL `https://pzuypkxbthxevdlqynqw.supabase.co`. It is **empty** (no `public` tables yet — clean slate). Both a legacy anon JWT key and a modern publishable key (`sb_publishable_…`) exist; the JS client accepts either in the anon-key slot — use the **publishable** key.
- Scripts: `npm run build | dev | lint | format | format:check`. "Done" = §8 verification.

## 3. Locked decisions (do not redesign)

1. **Deps:** `@supabase/ssr@^0.12` + `@supabase/supabase-js@^2.112` (peer), npm, from the repo root. That is the complete dependency budget for Phase 5.
2. **Env vars (canonical names):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` value — safe to ship to the browser), and `SUPABASE_SERVICE_ROLE_KEY` (server-only, never in the browser, not used by this phase's code but keep in `.env.example` for Phases 6–7). Update `.env.example`; `.env.local` (git-ignored) is filled by the executor from the MCP (§4.1).
3. **SSR client pattern (official Supabase, adapted for Next 16):** `createServerClient` with **`getAll`/`setAll`** cookie methods (the old `get`/`set`/`remove` are deprecated), async `cookies()` awaited. `createBrowserClient` for the client. Cookie writes from a Server Component are swallowed by a `try/catch` — that is by design, the proxy owns cookie refresh.
4. **Session refresh runs in the root `proxy.ts`** (Next 16 name; NOT `middleware.ts`), matcher excluding static assets, on every non-static request via `supabase.auth.getClaims()` — the identity check Supabase docs recommend ("use `getClaims` to protect pages and user data", verifies the JWT locally via JWKS). **The proxy never redirects** — this is a public portfolio; each protected route guards itself.
5. **Route guards:** `/login` and `/signup` redirect to `/account` when a session exists; `/account` redirects to `/login?next=/account` when it does not. Guards use `auth.getUser()` (fresh record; `/account` also displays the email). All three pages are `export const dynamic = "force-dynamic"` — this also keeps `next build` green with or without `.env.local`.
6. **No `/auth/callback` + `exchangeCodeForSession` this phase.** Email confirmation is the only signup path and it uses the **token_hash** flow: `signUp` returns the user but a `null` session; the confirmation email links to `…/auth/confirm?token_hash=…&type=email&next=…`; the `/auth/confirm` route calls `auth.verifyOtp({ type: "email", token_hash })` then redirects to `next` (sanitized). `next` is the `emailRedirectTo` passed to `signUp`, defaulting to `${origin}/account`. The `next` param is sanitized to in-app relative paths only (no open redirect).
7. **Employment status is collected at signup only**, passed to `signUp` as `options.data.employment_status`, and written to `profiles` by the `handle_new_user` trigger (reads `new.raw_user_meta_data->>'employment_status'`). The signup action whitelists the six values verbatim from §4.1. No profile-editing UI.
8. **Server actions (in `lib/auth/actions.ts`, `"use server"`):** `signUp`, `signIn`, `signOut`. Forms are client components using `useActionState` + `useFormStatus`-equivalent (`isPending`). Validation is hand-rolled (3 helpers) — **no Zod**. `signIn` → `redirect("/account")`; `signOut` → `redirect("/login")`; sign-up success (confirmations ON) → return `{ sent: true }` and the form shows "Check your email". If `data.session` is somehow present (confirmations off in dev), `redirect("/account")`.
9. **Schema lives in committed SQL under `supabase/migrations/`, applied remotely via the MCP.** Three files: profiles (incl. triggers + RLS), chat_interactions (usage), rewards (once-per-user). `auth.users` is owned by Supabase — never altered. RLS `auth.uid()` policies; `handle_new_user` is `SECURITY DEFINER` with `set search_path = ''`. After applying, **verify the migration is recorded** in `supabase_migrations.schema_migrations` so a future `supabase db push` doesn't collide (§4.5).
10. **TypeScript `Database` types** generated from the live DB into `types/supabase.ts` via the MCP `generate_typescript_types` tool (fallback: `npx supabase gen types typescript --project-id pzuypkxbthxevdlqynqw --schema public` — note **`--schema` singular**, a known CLI gotcha). Both clients are generic over `<Database>`.
11. **New routes (exact):** `app/auth/confirm/route.ts`, `app/login/page.tsx` + `app/login/LoginForm.tsx`, `app/signup/page.tsx` + `app/signup/SignupForm.tsx`, `app/account/page.tsx` + `app/account/SignOutButton.tsx`. Header `navLinks` gains one entry `{ href: "/account", label: "Account" }`. That's it — no API routes, no `/auth/callback`, no server-side session store, no rate-limit middleware.
12. **No Supabase CLI / Docker needed this phase** (the MCP talks to the hosted project directly). You may run `supabase login` + `supabase gen types` only if the MCP type tool misbehaves (then it's a James-in-the-loop step).

## 4. Milestone A — Supabase foundation + schema (commit once at the end)

### 4.1 The Supabase MCP server (this is how you have it — use it)

A **Supabase MCP server is connected to this session**, authenticated to James's account. Its tools drive the hosted project directly — no CLI login, no access token ceremony:

- `list_projects` — confirm the project (`james-imbuido-portfolio`, ref **`pzuypkxbthxevdlqynqw`**).
- `get_project_url(project_id)` and `get_publishable_keys(project_id)` — pull the URL and the publishable key. **These feed `.env.local`** (§4.3). Keys are publishable-by-design (safe to ship); the URL/key pair goes only into git-ignored `.env.local`.
- `apply_migration(project_id, name, query)` — **the way to apply DDL.** name is snake_case (e.g. `create_profiles`); query is the file's SQL. One call per migration file, in order.
- `list_tables(project_id, schemas: ["public"], verbose: true)` — confirm the three tables, their RLS status, and their policies.
- `execute_sql(project_id, query)` — for checks: migration history, `auth.users` count, advisor SQL. Read-only queries only; DDL goes through `apply_migration`.
- `get_advisors(project_id, "security")` — after applying, confirm no security advisories (this catches "RLS enabled but no policy", missing indexes, etc.).
- `generate_typescript_types(project_id)` — emit the `Database` type → `types/supabase.ts`.
- `get_cost` / `create_project` / `create_branch` — NOT needed; the project already exists. Never create a second project.

James already created the project, so this phase's only James-in-the-loop steps are: (a) the dashboard **Redirect URLs** config in §5.8 (required for confirmation emails to link back to localhost), and (b) the manual play-test signup/confirmation (§5.9). Everything else the executor does directly.

### 4.2 Dependencies + environment

```bash
npm install @supabase/ssr@^0.12 @supabase/supabase-js@^2.112
```

Update `.env.example` — replace the "Supabase — Phase 5" block (keep the LLM block below it untouched):

```
# ── Supabase — Phase 5 (auth, credits, chess rewards) ──
# From Supabase Dashboard → Project Settings → API, or the Supabase MCP
# (get_project_url / get_publishable_keys).
NEXT_PUBLIC_SUPABASE_URL="https://pzuypkxbthxevdlqynqw.supabase.co"
# Publishable key (sb_publishable_…). Safe to ship to the browser. The JS
# client accepts it in the anon-key slot; the legacy anon JWT also works.
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
# Server-only. Never expose to the browser, never commit. Not used by Phase 5
# code — reserved for Phase 6/7 server routes.
# SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Create `.env.local` (git-ignored) with the real values from the MCP `get_project_url` + `get_publishable_keys`. Do not commit it. Restart the dev server after writing it.

### 4.3 The clients and the proxy

**CREATE `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";

/** Browser client (§4.2 pattern) — lazy singleton, used by client components. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

**CREATE `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/supabase";

/**
 * Server client for server components, route handlers, and server actions.
 * `cookies()` is async in Next 16 — await it. The try/catch on setAll is
 * deliberate: Server Components may not write cookies; the proxy refreshes.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore, proxy refreshes.
          }
        },
      },
    },
  );
}
```

**CREATE `lib/supabase/proxy.ts`** (the refresh helper — do not run any code between `createServerClient` and `getClaims()`):

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session-refresh helper for the root proxy.ts (Next 16 renamed middleware →
 * proxy). Runs on every non-static request so the auth cookie stays fresh.
 * This is a public portfolio — the proxy NEVER redirects; each protected
 * route guards itself with getUser()/redirect().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  // getClaims() verifies the JWT locally (JWKS) — Supabase's recommended
  // server-side identity check; refresh flows through the setAll handler.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
```

**CREATE `proxy.ts`** at the repo root (NOT `src/`, NOT `middleware.ts`):

```ts
import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // All routes except static assets, image optimization, and the favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

> The `proxy.ts` export must be named `proxy` (or default). If you find yourself typing `middleware`, stop — that is the deprecated convention.

### 4.4 Migrations (committed SQL, applied via the MCP)

Create three files under `supabase/migrations/` (the directory already exists with `.gitkeep` — keep the `.gitkeep`):

**`supabase/migrations/20260824120000_create_profiles.sql`**

```sql
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
```

> Note on grants: Supabase's default privileges already grant `anon`/`authenticated`/`service_role` on new `public` tables, so no explicit `GRANT` is needed — RLS is the real gate (RLS default-deny applies even to granted roles). If you ever see "permission denied" in later phases, look at policies first, not grants.

**`supabase/migrations/20260824120001_create_chat_interactions.sql`**

```sql
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
```

**`supabase/migrations/20260824120002_create_rewards.sql`**

```sql
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
```

**Apply** each file in order via the MCP: `apply_migration(project_id: "pzuypkxbthxevdlqynqw", name: "create_profiles", query: <contents>)` → then `create_chat_interactions` → `create_rewards`. Do **not** use `execute_sql` for DDL; the MCP's `apply_migration` records the version in `supabase_migrations.schema_migrations`.

### 4.5 Verify the schema (run every check)

```bash
# 1. Tables + RLS present (expect 3 tables, rls_enabled true, policies listed)
#    → MCP: list_tables(project_id: "pzuypkxbthxevdlqynqw", schemas: ["public"], verbose: true)

# 2. Migration history recorded (so a future supabase db push won't replay/conflict)
#    → MCP: execute_sql("select version, name from supabase_migrations.schema_migrations order by version")
#    If a version row is missing, insert it:
#    INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
#      ('20260824120000', 'create_profiles'),
#      ('20260824120001', 'create_chat_interactions'),
#      ('20260824120002', 'create_rewards');
#    (Adjust column names to whatever the select shows if they differ.)

# 3. No security advisories (missing RLS would appear here)
#    → MCP: get_advisors(project_id: "pzuypkxbthxevdlqynqw", type: "security")   # expect no critical/major

# 4. Fresh DB sanity (expect 0)
#    → MCP: execute_sql("select count(*) from auth.users")

# 5. Generate TS types → save to types/supabase.ts
#    → MCP: generate_typescript_types(project_id: "pzuypkxbthxevdlqynqw")
#    The tool returns the generated Database type; write it to types/supabase.ts.
#    Fallback (needs James's CLI login, avoid if MCP worked):
#    npx supabase gen types typescript --project-id pzuypkxbthxevdlqynqw --schema public > types/supabase.ts
```

Repo-side checks:

```bash
npm ls @supabase/ssr @supabase/supabase-js                 # both present, versions match ^0.12 / ^2.112
npm ls @supabase/auth-ui-nextjs zod next-auth bcryptjs 2>&1  # "(empty)" each — no extra deps
npm run build 2>&1 | grep -E "Compiled successfully|error"   # compiled, no errors (pages dynamic; env not needed to build)
npm run lint && npm run format:check                         # both exit 0
grep -rn 'NEXT_PUBLIC_SUPABASE_URL\|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' lib/ proxy.ts  # 3+1 refs as designed
ls proxy.ts lib/supabase/*.ts types/supabase.ts supabase/migrations/*.sql  # all present
ls lib/supabase/.gitkeep lib/validation/.gitkeep supabase/migrations/.gitkeep  # still present
```

Commit (single, conventional):

```
feat(supabase): add SSR auth clients, proxy session refresh, and profiles schema

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 5. Milestone B — the account system (commit once at the end)

### 5.1 CREATE `lib/auth/employment-status.ts`

```ts
/** Employment Status options (master plan §4.1) — audience analytics only, never gates features. */
export const EMPLOYMENT_STATUSES = [
  "Student",
  "Seeking opportunities / unemployed",
  "Employed",
  "Employer / recruiter / hiring manager",
  "Other",
  "Prefer not to say",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export function isEmploymentStatus(value: string): value is EmploymentStatus {
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}
```

### 5.2 CREATE `lib/auth/actions.ts` (all server actions; `"use server"` on line 1)

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isEmploymentStatus } from "@/lib/auth/employment-status";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface AuthFormState {
  error: string | null;
}

export interface SignUpState extends AuthFormState {
  /** true only after a successful sign-up when email confirmation is pending. */
  sent: boolean;
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const employmentStatus = String(formData.get("employment_status") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", sent: false };
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, sent: false };
  if (!isEmploymentStatus(employmentStatus))
    return { error: "Please choose an employment status.", sent: false };

  // Email redirect URL must be an absolute URL (the confirmation email links to
  // /auth/confirm?token_hash=…&type=email&next=<this>).
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/account`,
      data: { employment_status: employmentStatus }, // trigger writes it to profiles
    },
  });

  if (error) return { error: error.message, sent: false };
  // Confirmations are ON → session is null; the user must verify the email.
  if (data.session) redirect("/account");
  return { error: null, sent: true };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };
  redirect("/account");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

> `redirect()` throws `NEXT_REDIRECT` — the success path never returns, so these functions keep a serializable return type for `useActionState`.

### 5.3 CREATE `app/auth/confirm/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");

  // Only in-app relative paths may be redirected to (no open redirect).
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/account";

  if (tokenHash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=Could not verify your email`);
}
```

> `type === "email"` narrows to the literal Supabase `EmailOtpType` — no cast needed. `verifyOtp` sets the session cookie server-side, so `/account` loads authenticated right after.

### 5.4 CREATE `app/login/page.tsx` + `app/login/LoginForm.tsx`

`app/login/page.tsx` (server component):

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — James Imbuido",
  description: "Sign in to your James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user) redirect("/account");

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading as="h1" title="Sign in" description="Welcome back." />
      <LoginForm />
    </Container>
  );
}
```

`app/login/LoginForm.tsx` (client — `"use client"` on line 1):

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

const fieldClasses =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

const initialState = { error: null as string | null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="mt-6 max-w-prose space-y-5">
      <div>
        <label htmlFor="login-email" className="block text-sm text-fg-muted">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm text-fg-muted">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClasses}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-accent-exp">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-fg-subtle">
        No account yet?{" "}
        <Link
          href="/signup"
          className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
        >
          Create one
        </Link>
        .
      </p>
    </form>
  );
}
```

### 5.5 CREATE `app/signup/page.tsx` + `app/signup/SignupForm.tsx`

`app/signup/page.tsx` mirrors `app/login/page.tsx` exactly (metadata `title: "Sign up — James Imbuido"`, gate → redirect `/account`, render `<SignupForm />`).

`app/signup/SignupForm.tsx` (client):

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp } from "@/lib/auth/actions";
import { EMPLOYMENT_STATUSES } from "@/lib/auth/employment-status";
import { Button } from "@/components/ui/Button";

const fieldClasses =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

const initialState = { error: null as string | null, sent: false };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  if (state.sent) {
    return (
      <p className="mt-6 max-w-prose rounded-lg border border-border bg-surface p-6 text-fg">
        Check your email for a confirmation link. Once you verify, you can sign in.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-prose space-y-5">
      <div>
        <label htmlFor="signup-email" className="block text-sm text-fg-muted">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm text-fg-muted">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={fieldClasses}
        />
        <p className="mt-1 text-xs text-fg-subtle">At least 8 characters.</p>
      </div>
      <div>
        <label
          htmlFor="signup-employment"
          className="block text-sm text-fg-muted"
        >
          Employment status
        </label>
        <select
          id="signup-employment"
          name="employment_status"
          required
          className={fieldClasses}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {EMPLOYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-fg-subtle">
          Used only for audience analytics — never gates any feature.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-accent-exp">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-fg-subtle">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
        >
          Sign in
        </Link>
        .
      </p>
    </form>
  );
}
```

### 5.6 CREATE `app/account/page.tsx` + `app/account/SignOutButton.tsx`

`app/account/page.tsx` (server component, `export const dynamic = "force-dynamic"`):

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = {
  title: "Account — James Imbuido",
  description: "Your James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/account");

  // RLS guarantees this returns only this user's own row (or null).
  const { data: profile } = await supabase
    .from("profiles")
    .select("employment_status, credits_remaining, chess_reward_claimed")
    .eq("id", user.id)
    .single();

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading as="h1" title="Account" description="Signed in as you." />
      <dl className="mt-8 max-w-prose space-y-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Email</dt>
          <dd className="font-mono text-fg">{user.email ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Employment status</dt>
          <dd className="text-fg">{profile?.employment_status ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">JTB interactions left</dt>
          <dd className="font-mono text-fg">{profile?.credits_remaining ?? 10}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Chess reward</dt>
          <dd className="text-fg">
            {profile?.chess_reward_claimed ? "Claimed (+5 JTB)" : "Not yet claimed"}
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        JTB interactions and the chess reward activate in later phases — these
        values are your database state. Employment status is audience analytics
        only and never gates any feature.
      </p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </Container>
  );
}
```

`app/account/SignOutButton.tsx` (client):

```tsx
"use client";

import { useTransition } from "react";

import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
```

### 5.7 MODIFY `components/navigation/Header.tsx` (one line)

In the `navLinks` array (line 9), add after the Contact entry:

```ts
{ href: "/account", label: "Account" },
```

`as const` already covers the new entry. Both desktop and mobile menus render it automatically. Touch nothing else in the file.

### 5.8 James-in-the-loop: confirmation-redirect config (required once)

The confirmation email links to `http://localhost:3000/auth/confirm…`, so Supabase must trust that host. In the dashboard (project `james-imbuido-portfolio` → **Authentication → URL Configuration**):

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/**` (the `emailRedirectTo` passed by `signUp` is `${origin}/account`, so `http://localhost:3000/account` must be covered — the wildcard covers it).

Later, when this deploys to Vercel, add the production domain the same way (out of scope this phase). Do NOT set this via the MCP — there is no dashboard-config MCP tool; it is a James browser step.

### 5.9 Milestone B verification (run every command; then the manual flow)

```bash
npm run build 2>&1 | tee /tmp/b.log | grep -E "^Failed|error"   # expect no output
npm run lint && npm run format:check                            # exit 0
npm ls @supabase/ssr @supabase/supabase-js                      # still the only new deps
npm run dev & sleep 8                                           # restart if .env.local was edited

curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/account   # 307 /login?next=/account (unauthenticated)
curl -s http://localhost:3000/login | grep -c 'name="email"'                            # 1
curl -s http://localhost:3000/login | grep -c 'name="password"'                         # 1
curl -s http://localhost:3000/signup | grep -c 'name="employment_status"'               # 1
curl -s http://localhost:3000/signup | grep -o 'Student\|Prefer not to say' | sort -u | wc -l   # 2 (options present)
curl -s http://localhost:3000/signup | grep -c 'audience analytics'                     # >= 1 (honesty copy)
curl -s http://localhost:3000/ | grep -c '/account'                                     # >= 1 (Header link rendered)
curl -s http://localhost:3000/ | grep -c 'sb-anon\|auth/confirm'                        # 0 (no supabase leakage on homepage)
grep -rn 'middleware' proxy.ts                                                          # NO output (not middleware)
grep -rnE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' app/login app/signup app/account lib/auth lib/supabase proxy.ts  # NO output
kill %1
```

Then the **manual play-test** (state plainly in your final report which of these you exercised; James does the email step):
1. Open `/signup`, register with a real inbox. Confirm the "Check your email" state shows.
2. **James (or the executor, temporarily, dev-only):** open the confirmation email and click the link → lands on `/account` signed in.
   - Dev-only shortcut for the executor's own verification (NOT for the real test): `execute_sql("update auth.users set email_confirmed_at = now() where email = '<address>'")`, then `/signin` works. State that you used it.
3. `/account` shows the email, employment status, `10`, `Not yet claimed`.
4. `/login` signs out → lands on `/login`. Sign back in.
5. While logged in, visiting `/login` or `/signup` redirects to `/account`.
6. Navigate the site as a logged-out visitor — `/`, `/chess`, `/about` all load normally (the proxy refreshes, never blocks).
7. Back in the DB (`execute_sql`): `select id, email, employment_status from auth.users`, `select * from profiles` — confirm the trigger seeded the profile row with the chosen employment status.

**Optional final step (mirroring Phase 4):** update the two status lines in `CLAUDE.md` (Phase 4 chess paragraph → "**Phase 5 complete** — Supabase email/password auth (`/login`, `/signup`, `/account`), SSR clients + `proxy.ts` session refresh, and the `profiles`/`chat_interactions`/`rewards` schema with RLS applied to the hosted project. Next up: **Phase 6 — JTB** per §34.") and the `## Status` paragraph in `README.md`. Touch nothing else — leave the fenced next-agent-rules block in CLAUDE.md byte-identical.

Commit (single, conventional):

```
feat(auth): add email/password auth with login, signup, and account pages

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 6. Drift risks — read before starting

| Risk | Guardrail |
|---|---|
| Creating `middleware.ts` (deprecated in Next 16) | Use `proxy.ts` at repo root, named export `proxy`. The grep check in §5.9 is a tripwire. |
| Old Supabase tutorials: sync `cookies()`, `get`/`set`/`remove`, `updateUser` in proxy | Async `cookies()` awaited; `getAll`/`setAll` only. |
| Relying on `getSession()` for server-side identity (it trusts the cookie unverified) | Identity comes from `getUser()` (verify) / `getClaims()` (proxy); `getSession()` is never used for gating. |
| Building `/auth/callback` + `exchangeCodeForSession` for email confirmation | Email uses `/auth/confirm` + `verifyOtp({type:"email", token_hash})`. No callback route this phase. |
| Sign-up not passing employment status, or passing it unvalidated | `options.data.employment_status`; whitelist against `EMPLOYMENT_STATUSES` in the action. |
| `.env.local` missing → dev/auth pages error at runtime | §4.2 creates it from the MCP; `dynamic = "force-dynamic"` keeps `next build` green with or without it. |
| Applying DDL with `execute_sql` instead of `apply_migration` (breaks migration history) | DDL → `apply_migration` only; history verified in §4.5 and repaired if the row is missing. |
| RLS added but no policy, or policy typo → own-row leak or total lockout | §4.5 `get_advisors` + `list_tables` verify; `auth.uid()`-scoped policies are the only rule. |
| Confirmation emails 404 because Redirect URLs don't allow localhost | §5.8 James dashboard step (Site URL + `http://localhost:3000/**`) before the manual flow. |
| Hard-coded colors or new deps (zod, UI kit, bcrypt) | Token rule #2; dep rule #1; the `npm ls` + grep checks enforce both. |
| Proxy redirecting the whole site (it's a public portfolio) | Proxy never redirects; per-route guards (§3.5). |
| `next` param open-redirect via `/auth/confirm` | Sanitized to single-slash relative paths only (§5.3). |
| Deleting `.gitkeep` files | Keep every one, including `lib/supabase/.gitkeep`. |

## 7. Execution order (exact)

**Milestone A** — commit once at the end:
1. `npm install @supabase/ssr@^0.12 @supabase/supabase-js@^2.112`
2. `.env.example` + `.env.local` (values from the MCP)
3. `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, root `proxy.ts`
4. Three migration SQL files under `supabase/migrations/`
5. MCP: apply migrations → verify (`list_tables`, migration history, advisors, `auth.users` count)
6. MCP: `generate_typescript_types` → `types/supabase.ts`
7. Verification block §4.5 (every command) → fix → commit with the given message.

**Milestone B** — commit once at the end:
1. `lib/auth/employment-status.ts`
2. `lib/auth/actions.ts`
3. `app/auth/confirm/route.ts`
4. `app/login/page.tsx` + `app/login/LoginForm.tsx`
5. `app/signup/page.tsx` + `app/signup/SignupForm.tsx`
6. `app/account/page.tsx` + `app/account/SignOutButton.tsx`
7. `components/navigation/Header.tsx` navLinks (one line)
8. James dashboard Redirect URLs config (§5.8)
9. Verification block §5.9 (every command, plus the manual play-test report) → commit with the given message.

## 8. Definition of done (§34 Phase 5 rows, vs. what waits)

Satisfied by this phase:
- [ ] Supabase project connected (ref `pzuypkxbthxevdlqynqw`) and schema applied: `profiles` (10 credits default, chess-reward flag), `chat_interactions`, `rewards` — all with RLS (`auth.uid()`), triggers (`handle_new_user`, `set_updated_at`)
- [ ] SSR auth wired the Supabase way: `createServerClient`/`createBrowserClient`, async cookies, `proxy.ts` session refresh with `getClaims()`, `getUser()` server-side verification
- [ ] Sign up (email + password + employment status), email confirmation via `/auth/confirm`, sign in, sign out
- [ ] `/account` shows the authenticated user's real DB state (email, employment status, credits, reward flag)
- [ ] Public routes unaffected (proxy refreshes, never blocks; homepage static)
- [ ] `build`, `lint`, `format:check` green; exactly two new deps; migration history recorded; `.env.local` never committed

Explicitly NOT satisfied here (later phases — say so in your report, do not fake):
- [ ] JTB chat + server-verified credit deduction (Phase 6) — schema only
- [ ] Chess reward: server replay + atomic +5 award via `rewards` (Phase 7) — schema + `unique(user_id, reward_type)` only
- [ ] Password reset, social login, admin, roles (§29 V1 scope) — never built
- [ ] Vercel env + production Redirect URLs — deploy phase

And as always: no fabricated portfolio copy; honesty markers where real data isn't wired; every existing `.gitkeep` intact.
