# PHASE 7 — CHESS REWARD: Implementation Plan

> Executor: you are implementing **Phase 7 (Chess reward)** of a Next.js portfolio, in **two milestones (A then B), each ending in one conventional commit**. Follow this document exactly. Do not invent features, routes, or dependencies. Do not touch 3D files (`components/universe/`, `lib/universe/`), `app/page.tsx`, `app/design/page.tsx`, JTB (`app/api/jtb/`, `app/jtb/`, `components/jtb/`, `lib/jtb/`), auth (`lib/auth/`, `app/login|signup|account|auth/*` except the two copy edits listed in §5.6), or anything built in Phases 1–6 — all out of scope. If you run low on budget, complete and commit Milestone A and stop; A is self-standing (the verified claim API is live and curl/browser-verifiable, and nothing in B changes its contract).
>
> You have a live Supabase project (**ref `pzuypkxbthxevdlqynqw`**, name `james-imbuido-portfolio`) driven through a **Supabase MCP server** connected to this session — use it for applying the migration, verifying functions, running security advisors, generating TypeScript types, and DML/SQL checks. The CLI/local-Docker stack is NOT required. The repo also has **Playwright MCP** tooling in active use (`.playwright-mcp/` exists) — that is how you do authenticated browser verification; never forge Supabase session cookies by hand.

## 1. Context

Phases 1–6 delivered the design system, the Data Universe, the conventional portfolio, the fully playable chess UI (hand-built board, isomorphic `chess.js` wrapper, honest heuristic opponents at easy/medium/hard), Supabase email/password auth, RLS-locked `profiles`/`chat_interactions`/`rewards` schema, and production JTB credit spending (`POST /api/jtb` with `deduct_credit` after success only). Phase 7 per master plan §28 builds the **verified reward**: **when an authenticated user beats the Chess AI by checkmate, the client submits the full move history; the server replays it with the trusted rules engine, verifies the win, and atomically awards +5 JTB interactions, once per user.** Authoritative spec sections: §3.7 (the 8-step server flow this phase implements verbatim), §5 (10 initial credits, +5 reward), §14.2/§14.3 (chess.js; Next.js server routes, no FastAPI), §21 (never trust `playerWon = true` from the browser; RLS; secrets in env), §28 Phase 7 (six items: submission, replay, win verification, reward validation, atomic credit update, confirmation UI), §32 Chess rows ("Completed games can be verified server-side", "Winning awards +5 JTB credits", "Reward cannot be claimed repeatedly"), §33 rules 11–13 (validate server inputs, never trust client credits or chess claims).

**The one thing you must understand before writing a line:** every seam this phase needs was built on purpose in earlier phases and already exists — do not rebuild them:

- `lib/chess/engine.ts` is **isomorphic** (no React/DOM) and exports `replayMoves(moves, fen?)` — a ~10-line Phase-7 seam that re-applies a move list from the standard initial position through the real rules engine. The server route imports it unchanged.
- `public.rewards` has `unique(user_id, reward_type)` — the once-per-user gate. `reward_type = 'chess'`.
- `public.profiles.chess_reward_claimed` (boolean) and `credits_remaining` exist; `deduct_credit`/`record_chat_interaction` (Phase 6) established the exact `SECURITY DEFINER set search_path = ''` + auth-check + `revoke … from public, anon; grant … to authenticated` pattern your new award function must mirror.
- The game-over panel in `components/chess/GameStatus.tsx` holds placeholder copy (`Verified rewards land with accounts in a later phase…`) — that is the UI seam you replace.

What the server **can** verify and what it **cannot**: the game runs entirely client-side, so the server can prove "this is a fully legal game from the initial position, ending in checkmate with the caller's side as winner" — it cannot prove the opponent really was the site AI and not a friend/engine. That is inherent to the design (§3.7 asks exactly for the former), and the once-per-user DB gate bounds abuse to a single +5. Say this plainly in your final report; never imply stronger verification than exists.

### Hard rules (violating any of these = failed milestone)

1. **Zero new dependencies, zero new environment variables.** `chess.js@^1.4.0` and `@supabase/*` are already installed. The route uses the existing `NEXT_PUBLIC_SUPABASE_*` env. The service-role key stays commented out — the award goes through a `SECURITY DEFINER` function, same as Phase 6.
2. **Design tokens only.** No hex codes, no `zinc-*`/`gray-*`/`slate-*` utilities in new/edited UI. Error text uses `text-accent-exp` (repo convention). Panel/border/surface styles copy `GameStatus`'s existing game-over panel exactly.
3. **Strict TypeScript, no `any`.** `npm run build` must type-check clean. No `JSX.Element` annotations. Hand-rolled validation only (no Zod — mirroring `lib/validation/jtb.ts`).
4. **This is NOT the Next.js you know.** Next.js **16.3.2**, React **19.2.8**. Follow the existing `app/api/jtb/route.ts` shape for the new route (named `POST` export, `NextResponse.json`, `export const runtime = "nodejs"` + `export const dynamic = "force-dynamic"`). If unsure about an API, read `node_modules/next/dist/docs/` first. There is no `middleware.ts`; session refresh lives in root `proxy.ts` — do not touch it.
5. **Keep every existing `.gitkeep`** — including `lib/rewards/.gitkeep`. The award RPC is called inline from the route (the Phase-6 JTB pattern: `deduct_credit` is called inline in `app/api/jtb/route.ts`); `lib/rewards/` stays scaffold-only because there is exactly one caller.
6. **Security invariants (§3.7, §21):** the client sends **moves and its color only** — never a result verdict, never a FEN, never a credit count. Replay always starts from the standard initial position. The award amount (`5`) and `reward_type` (`'chess'`) are hard-coded **inside the SQL function**, unreachable from the client. `chess_reward_claimed` and `credits_remaining` are updated only by that function in the same transaction as the reward-row insert.
7. **Honesty rule:** no fabricated reward mechanics in copy. Difficulty does not gate the reward (§3.7 has no difficulty clause) — say so where relevant. A resigned game, a draw, a loss, and an unfinished game earn nothing — the API enforces it and no copy may suggest otherwise.
8. **No client-trusted claim state.** The UI never reads `rewards`/`profiles` from the browser to decide eligibility; it calls the API and renders what the API says (401/409/200). `/chess` stays a static page — do NOT add per-request auth reads to it.

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TS strict, Tailwind v4 CSS-first (`app/globals.css`; no `tailwind.config.*`). `@/*` → repo root. npm only. No test framework by design. Prettier ignores `*.md` — this plan is never format-checked. Scripts: `npm run build | dev | lint | format | format:check`.
- `components/chess/`: `ChessGame.tsx` (the container: reducer-driven, `createEngine()` held by reference, `state.history: MoveSnapshot[]` mirrors the engine, `state.result: GameResult | null`, `state.playerColor: Side`), `ChessBoard.tsx`, `GameControls.tsx`, `GameStatus.tsx`, `MoveList.tsx`, `PromotionDialog.tsx`. No fetch anywhere — Phase 7 adds the first one.
- `lib/chess/engine.ts`: exports `createEngine`, `ChessGameEngine`, and **`replayMoves(moves, fen?)`** — `{ ok: true; engine } | { ok: false; atIndex: number }`. `tryMove` never throws on illegality and **requires `promotion` to be named** for promotion moves (no silent queen default). `status()` distinguishes `checkmate` / `stalemate` / `threefold` / `insufficient` / `fifty-move`; `winner` is derived from side-to-move at mate.
- `lib/chess/opponents.ts`: easy = random legal move, medium = 1-ply greedy, hard = 2-ply alpha-beta; all pick only among provided legal moves. `TODO(MODEL)` marks the future ONNX seam — NOT this phase.
- `types/chess.ts`: `Side`, `PieceType`, `PromotionChoice`, `SquareName` (`` `${File}${Rank}` `` template literal), `MoveSnapshot`, `DrawReason`, `EngineStatus`, `GameResult`, `Difficulty`, `SquareState`. You extend this file in Milestone A.
- `lib/validation/jtb.ts` is the validation idiom to mirror: pure sync function, union result `{ ok: true, … } | { ok: false; error: string }`, no throwing.
- `app/api/jtb/route.ts` is the route idiom to mirror: numbered step comments, `errorResponse(code, message, status, options?)` helper, typed error body from `lib/jtb/types.ts`, `supabase.rpc(...)` via the server client, `console.error` on server faults, `NextResponse.json` success.
- `lib/supabase/server.ts`: `createClient()` (async; `createServerClient<Database>` with `getAll`/`setAll`+try/catch). Routes/pages authenticate with `supabase.auth.getUser()` — never `getSession()`.
- DB (live on the hosted project): `profiles` (`credits_remaining` default 10, `check >= 0`, `chess_reward_claimed` default false), `rewards` (`unique(user_id, reward_type)`, select-policy only for users — the Phase-6 hardening migration **dropped** `rewards_insert_own`, so the award MUST go through your new SECURITY DEFINER function), functions `deduct_credit(uuid)→integer` and `record_chat_interaction(uuid,jsonb,jsonb)→void` (both `prosecdef = true`, execute revoked from public/anon, granted to authenticated).
- `types/supabase.ts`: generated `Database` types; `Functions` currently lists only `deduct_credit` and `record_chat_interaction`. Regenerated in Milestone A.
- `supabase/migrations/`: `20260824120000_create_profiles.sql`, `…120001_create_chat_interactions.sql`, `…120002_create_rewards.sql`, `…120003_harden_jtb_credits.sql`. Migration history rows exist in `supabase_migrations.schema_migrations` keyed to those filenames (the MCP stamps its own versions by default — realign after applying, as done before).
- UI primitives: `Button({ variant?: "primary"|"secondary"|"ghost", size?: "sm"|"md"|"lg", href?, … })` — without `href` it renders a real `<button>`; `Container`, `SectionHeading`. Links copy the login page's inline-link classes: `text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong`.
- Stale copy you will fix in Milestone B: `app/chess/page.tsx` note ("…Once accounts and verified rewards land in later phases…"), `components/chess/GameStatus.tsx` placeholder sentence in the game-over panel, `app/account/page.tsx` footnote ("JTB interactions and the chess reward activate in later phases…").
- `/login` ignores any `next` param on success (out of scope to change) — signed-out winners who tap "Sign in" land on `/account` and may navigate back; acceptable for V1, do not "fix" it.

## 3. Locked decisions (do not redesign)

1. **Exactly one new endpoint: `POST /api/chess`** (`app/api/chess/route.ts`). Its single job is the reward claim (§15 reserves `app/api/chess` for this). No GET status route, no action multiplexing.
2. **Request contract:** `{ moves: SubmittedMove[]; playerColor: Side }` where `SubmittedMove = { from: SquareName; to: SquareName; promotion?: PromotionChoice }`. Nothing else is accepted: no FEN, no result, no difficulty, no timestamps. `playerColor` exists solely so the server can compare `winner` against it — the server never trusts it.
3. **Validation** (`lib/validation/chess.ts`, mirrors `lib/validation/jtb.ts`): object body; `playerColor ∈ {"w","b"}`; `moves` array, 1–**300** entries (`MAX_SUBMITTED_MOVES = 300` — well past the longest recorded tournament games; a mate under the fifty-move rule cannot need more); each entry an object with `from`/`to` matching `/^[a-h][1-8]$/` and optional `promotion ∈ {"q","r","b","n"}`.
4. **Reward constants** in a new `lib/chess/constants.ts`: `CHESS_REWARD_CREDITS = 5`, `MAX_SUBMITTED_MOVES = 300`. §3.7/§5 pin the 5; the route and the UI share the constant. (`reward_type 'chess'` is hard-coded in SQL only — no TS constant, it has one use.)
5. **Server flow (order matters, mirrors JTB's numbered steps):** 1 auth → 2 parse/validate → 3 claimed pre-check (RLS-scoped profile read — cheap, gives the clean 409 UX; NOT the enforcement boundary) → 4 `replayMoves` from the initial position → 5 win check (`status.kind === "over"`, `reason === "checkmate"`, `winner === playerColor`) → 6 `rpc("claim_chess_reward")` (the authoritative, atomic, once-per-user award) → 7 success JSON. Validation before the profile read: garbage bodies cost zero DB round-trips.
6. **The SQL function is the only award path** and enforces everything the route cannot: caller-identity check (`auth.uid()`), once-per-user via `ON CONFLICT (user_id, reward_type) DO NOTHING`, `+5` + `chess_reward_claimed = true` in the same transaction. The route's job is proof; the function's job is award. Both are needed; neither alone is sufficient.
7. **No rate limiter on this route.** A successful claim is DB-gated to once ever; failed replays are cheap, stateless, bounded CPU (≤300 moves). §5.3's safeguards are JTB-specific. Adding a limiter would violate "no unnecessary abstractions".
8. **Claim UX is an explicit button inside the game-over panel**, shown only when `result.reason === "checkmate" && result.winner === playerColor`. No auto-submit on win (a silent POST from a visitor who may not even have an account is bad UX and wasted load). States: idle/submitting (`Verifying your win…`) → claimed (shows new balance + `/jtb` link) / already-claimed / needs-sign-in (link to `/login`) / failed (retry button). The component owns its own fetch + state machine (`useState`), mirroring the JTB components' client-side idiom — no server action (this is an API route, not a form).
9. **Game-over panel seam:** `GameStatus` gains an optional `children?: ReactNode` rendered inside the result panel; `ChessGame` passes `<RewardClaim …/>` as that child only on a player checkmate win. The Phase-4 placeholder sentence inside the panel is deleted, not reworded — the reward is live now.
10. **Milestone split:** A = migration + function + types + validation + constants + route (backend, fully verifiable without UI). B = `RewardClaim` + `GameStatus`/`ChessGame` wiring + the three copy edits + status-line updates. Two commits total.
11. **Testing stance:** API verified browser-side via Playwright MCP against `localhost:3000` with a real signed-in test user (`page.evaluate` + `fetch` — same-origin so the session cookie rides along; never hand-craft `sb-*-auth-token`). The deterministic win vector is Fool's mate (§4.4) — legal, engine-verifiable, and by design it doesn't matter that no AI produced it. UI happy path is one genuine in-browser win vs the easy opponent (Scholar's-mate script with resign/retry loop, §5.5). UI verification never mocks fetch.
12. **Test user:** executor creates `phase7-chess-test@example.invalid` via the real `/signup` form, then stamps confirmation with `execute_sql("update auth.users set email_confirmed_at = now() where email = 'phase7-chess-test@example.invalid'")` — the documented dev-only shortcut from Phase 5 (`.invalid` never receives mail; that's the point). Keep a fresh password in an env var or note for the session; never commit it. Reuse the user across both milestones; do NOT delete it at the end (James may rerun).

## 4. Milestone A — award function + claim API (commit once at the end)

### 4.1 CREATE `supabase/migrations/20260825120000_claim_chess_reward.sql`

```sql
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
```

**Apply via the MCP:** `apply_migration(project_id: "pzuypkxbthxevdlqynqw", name: "claim_chess_reward", query: <file contents>)`. Then verify and realign history:

```
# 1. Function exists and is SECURITY DEFINER
#    → MCP: execute_sql("select proname, prosecdef from pg_proc where proname = 'claim_chess_reward'")
#      expect one row, prosecdef = true
# 2. Migration history — expect a row named claim_chess_reward keyed to 20260825120000.
#    → MCP: execute_sql("select version, name from supabase_migrations.schema_migrations order by version desc limit 6")
#    If the MCP stamped its own timestamp instead, realign:
#      delete from supabase_migrations.schema_migrations where <the stamped row>;
#      insert into supabase_migrations.schema_migrations (version, name)
#      values ('20260825120000', 'claim_chess_reward');
#    (Match the column names the select actually returns if they differ.)
# 3. No new security advisories (RLS / function security lint)
#    → MCP: get_advisors(project_id: "pzuypkxbthxevdlqynqw", type: "security")
# 4. Regenerate TS types → overwrite types/supabase.ts
#    → MCP: generate_typescript_types(project_id: "pzuypkxbthxevdlqynqw")
#    The Functions block must now include claim_chess_reward. Keep the file's
#    existing style (it is generated — do not hand-edit anything else).
```

### 4.2 EXTEND `types/chess.ts` (append — do not reorder existing exports)

```ts
/** Wire format for one submitted move — from/to/promotion is all replay needs. */
export interface SubmittedMove {
  from: SquareName;
  to: SquareName;
  promotion?: PromotionChoice;
}

/** POST /api/chess request body: moves + caller's color, nothing else (§3.7). */
export interface ChessClaimRequest {
  moves: SubmittedMove[];
  playerColor: Side;
}

export type ChessClaimErrorCode =
  | "unauthenticated"
  | "invalid"
  | "illegal_game"
  | "not_a_win"
  | "already_claimed"
  | "internal";

export interface ChessClaimError {
  error: {
    code: ChessClaimErrorCode;
    message: string;
  };
  creditsRemaining?: number;
}

export interface ChessClaimSuccess {
  ok: true;
  creditsAwarded: number;
  creditsRemaining: number;
}

/** Shape of the claim_chess_reward RPC's jsonb return. */
export interface ClaimChessRewardResult {
  claimed: boolean;
  creditsRemaining: number | null;
}
```

### 4.3 CREATE `lib/chess/constants.ts` and `lib/validation/chess.ts`

`lib/chess/constants.ts`:

```ts
/** Phase 7 reward + submission bounds (master plan §3.7/§5: +5, once per user). */
export const CHESS_REWARD_CREDITS = 5;
export const MAX_SUBMITTED_MOVES = 300;
```

`lib/validation/chess.ts` (mirrors `lib/validation/jtb.ts` — pure, sync, union result, no throwing):

```ts
/**
 * Pure, synchronous chess-claim validation. Strict TS, no `any`; returns a
 * union so callers never throw on bad input (mirrors lib/validation/jtb.ts).
 */
import { MAX_SUBMITTED_MOVES } from "@/lib/chess/constants";
import type {
  ChessClaimRequest,
  PromotionChoice,
  Side,
  SquareName,
  SubmittedMove,
} from "@/types/chess";

export type ChessClaimParseResult =
  | { ok: true; claim: ChessClaimRequest }
  | { ok: false; error: string };

const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTIONS: readonly PromotionChoice[] = ["q", "r", "b", "n"];

function isSquareName(value: unknown): value is SquareName {
  return typeof value === "string" && SQUARE_RE.test(value);
}

export function parseChessClaim(body: unknown): ChessClaimParseResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;

  const playerColor = record.playerColor;
  if (playerColor !== "w" && playerColor !== "b") {
    return { ok: false, error: 'playerColor must be "w" or "b".' };
  }

  const rawMoves = record.moves;
  if (!Array.isArray(rawMoves)) {
    return { ok: false, error: 'An array "moves" field is required.' };
  }
  if (rawMoves.length === 0) {
    return { ok: false, error: "Move history must not be empty." };
  }
  if (rawMoves.length > MAX_SUBMITTED_MOVES) {
    return {
      ok: false,
      error: `Move history must be at most ${MAX_SUBMITTED_MOVES} moves.`,
    };
  }

  const moves: SubmittedMove[] = [];
  for (let i = 0; i < rawMoves.length; i++) {
    const raw = rawMoves[i];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Move ${i + 1} must be an object.` };
    }
    const { from, to, promotion } = raw as Record<string, unknown>;
    if (!isSquareName(from) || !isSquareName(to)) {
      return {
        ok: false,
        error: `Move ${i + 1} needs valid "from"/"to" squares.`,
      };
    }
    if (
      promotion !== undefined &&
      !PROMOTIONS.includes(promotion as PromotionChoice)
    ) {
      return { ok: false, error: `Move ${i + 1} has an invalid promotion.` };
    }
    moves.push({
      from,
      to,
      ...(promotion ? { promotion: promotion as PromotionChoice } : {}),
    });
  }

  return { ok: true, claim: { moves, playerColor: playerColor as Side } };
}
```

### 4.4 CREATE `app/api/chess/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { replayMoves } from "@/lib/chess/engine";
import { CHESS_REWARD_CREDITS } from "@/lib/chess/constants";
import { parseChessClaim } from "@/lib/validation/chess";
import type {
  ChessClaimError,
  ChessClaimErrorCode,
  ClaimChessRewardResult,
} from "@/types/chess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  code: ChessClaimErrorCode,
  message: string,
  status: number,
  options?: { creditsRemaining?: number },
): NextResponse {
  const body: ChessClaimError = {
    error: { code, message },
    ...(options?.creditsRemaining !== undefined
      ? { creditsRemaining: options.creditsRemaining }
      : {}),
  };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  // 1) Auth — the reward belongs to a verified session (§3.7, §21).
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse(
      "unauthenticated",
      "Sign in to claim the chess reward.",
      401,
    );
  }

  // 2) Validation — shape-check the submission before any DB work (§33.11).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid", "Request body must be valid JSON.", 400);
  }
  const parsed = parseChessClaim(body);
  if (!parsed.ok) {
    return errorResponse("invalid", parsed.error, 400);
  }

  // 3) Claimed pre-check — RLS scopes this to the caller's own profile. Cheap
  //    and gives a clean 409 UX; the authoritative gate is the unique constraint
  //    enforced inside claim_chess_reward.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining, chess_reward_claimed")
    .eq("id", user.id)
    .single();
  if (profile?.chess_reward_claimed) {
    return errorResponse(
      "already_claimed",
      "You've already claimed the chess reward.",
      409,
      { creditsRemaining: profile.credits_remaining },
    );
  }

  // 4) Server-side replay — always from the standard initial position, so every
  //    move must be legal and turns must alternate. Client-provided FENs and
  //    result verdicts are never accepted (§3.7, §21).
  const replay = replayMoves(parsed.claim.moves);
  if (!replay.ok) {
    return errorResponse(
      "illegal_game",
      `Move ${replay.atIndex + 1} is not legal — the game was rejected.`,
      422,
    );
  }

  // 5) Win verification — the replayed game must be over by checkmate with the
  //    caller's side as winner. Draws, losses, resignations, and unfinished
  //    games earn nothing.
  const status = replay.engine.status();
  if (
    status.kind !== "over" ||
    status.reason !== "checkmate" ||
    status.winner !== parsed.claim.playerColor
  ) {
    return errorResponse(
      "not_a_win",
      "Only a game you won by checkmate earns the reward.",
      422,
    );
  }

  // 6) Atomic award — one SECURITY DEFINER call inserts the reward row (the
  //    unique(user_id, reward_type) constraint makes it once-per-user), credits
  //    +5, and flips chess_reward_claimed in the same transaction.
  const { data, error: claimError } = await supabase.rpc("claim_chess_reward", {
    p_user_id: user.id,
    p_metadata: {
      moveCount: parsed.claim.moves.length,
      playerColor: parsed.claim.playerColor,
      finalFen: replay.engine.fen(),
    },
  });
  if (claimError) {
    console.error("[chess] claim_chess_reward error:", claimError.message);
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }
  const claim = data as ClaimChessRewardResult | null;
  if (!claim || typeof claim.claimed !== "boolean") {
    console.error("[chess] claim_chess_reward returned unexpected shape");
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }
  if (!claim.claimed) {
    // Lost the pre-check race: the reward was claimed by a concurrent request.
    return errorResponse(
      "already_claimed",
      "You've already claimed the chess reward.",
      409,
    );
  }
  if (typeof claim.creditsRemaining !== "number") {
    console.error("[chess] claim_chess_reward claimed but no balance returned");
    return errorResponse(
      "internal",
      "Something went wrong on our side — please try again.",
      500,
    );
  }

  // 7) Success.
  return NextResponse.json({
    ok: true,
    creditsAwarded: CHESS_REWARD_CREDITS,
    creditsRemaining: claim.creditsRemaining,
  });
}
```

> The cast `data as ClaimChessRewardResult | null` is deliberate: the RPC returns `jsonb` (typed `Json` in the regenerated `types/supabase.ts`), and the three runtime guards above it are what make the cast honest. The `status.reason` access in step 5 type-checks because the `||` chain narrows `status.kind === "over"` first.

**Test vectors (used by §4.5 — keep them verbatim):**

```js
// WIN (Fool's mate, caller is Black): 1. f3 e5 2. g4 Qh4#
const FOOLS_MATE = {
  playerColor: "b",
  moves: [
    { from: "f2", to: "f3" },
    { from: "e7", to: "e5" },
    { from: "g2", to: "g4" },
    { from: "d8", to: "h4" },
  ],
};
// COLOR LIE: same moves, caller claims White → winner is Black → not_a_win.
// ILLEGAL: first move e2→e5 is impossible → illegal_game at move 1.
// UNFINISHED: 1. e4 e5 (e2e4, e7e5) → game in progress → not_a_win.
```

### 4.5 Milestone A verification (run every step; report plainly what passed)

Repo checks:

```bash
npm run build 2>&1 | grep -E "^Failed|error"   # expect no output (type-check clean)
npm run lint && npm run format:check            # both exit 0
ls app/api/chess/route.ts lib/validation/chess.ts lib/chess/constants.ts supabase/migrations/20260825120000_claim_chess_reward.sql
ls lib/rewards/.gitkeep lib/validation/.gitkeep supabase/migrations/.gitkeep 2>/dev/null  # any gitkeeps that exist stay
npm ls | tail -n +2 | wc -l                     # dependency count unchanged (no new deps)
grep -n "claim_chess_reward" types/supabase.ts  # regenerated types include the function
```

Runtime API matrix — Playwright MCP against `npm run dev` (`http://localhost:3000`). First create and sign in as the test user (§3.12): open `/signup` in a Playwright page, submit the form with `phase7-chess-test@example.invalid` / a session-only password / any employment status, then MCP `execute_sql("update auth.users set email_confirmed_at = now() where email = 'phase7-chess-test@example.invalid'")`, then `/login` and sign in. Record the pre-claim balance via `execute_sql("select credits_remaining, chess_reward_claimed from profiles where id in (select id from auth.users where email = 'phase7-chess-test@example.invalid')")` — expect `10, false` for a fresh user.

Then, in the **signed-in** page, run each case with `page.evaluate` (adapt to the MCP's evaluate tool name):

```js
const case1 = await fetch("/api/chess", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(FOOLS_MATE /* + variants below */),
});
// capture { status: case1.status, body: await case1.json() } per case
```

| # | Case (body) | Expect |
|---|---|---|
| 1 | No session at all (fresh Playwright context, never signed in) — FOOLS_MATE | **401**, `error.code: "unauthenticated"` |
| 2 | `{ playerColor: "x", moves: [] }` | **400**, `invalid` |
| 3 | `[{ from: "e2", to: "e5" }]` as `playerColor: "w"` | **422**, `illegal_game`, message names move 1 |
| 4 | Unfinished game (e2e4, e7e5), `playerColor "w"` | **422**, `not_a_win` |
| 5 | FOOLS_MATE moves but `playerColor: "w"` (color lie) | **422**, `not_a_win` — the never-trust-the-client proof |
| 6 | FOOLS_MATE, `playerColor: "b"` | **200**, `{ ok: true, creditsAwarded: 5, creditsRemaining: <before>+5 }` |
| 7 | FOOLS_MATE again (immediate retry) | **409**, `already_claimed` |
| 8 | Malformed JSON (`body: "{not json"`) | **400**, `invalid` |

SQL assertions (MCP `execute_sql`):

```sql
-- one row, credits_awarded 5, metadata->>'moveCount' = '4', 'playerColor' = 'b',
-- finalFen matches the Fool's-mate terminal position
select reward_type, credits_awarded, metadata from public.rewards
where user_id in (select id from auth.users where email = 'phase7-chess-test@example.invalid');

-- flag flipped, balance = pre-claim + 5 exactly once (not +10 from the retry)
select credits_remaining, chess_reward_claimed from public.profiles
where id in (select id from auth.users where email = 'phase7-chess-test@example.invalid');
```

Commit (single, conventional):

```
feat(chess): add server-verified reward claim API with atomic +5 award

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 5. Milestone B — reward confirmation UI + copy (commit once at the end)

### 5.1 CREATE `components/chess/RewardClaim.tsx`

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { CHESS_REWARD_CREDITS } from "@/lib/chess/constants";
import type {
  ChessClaimError,
  ChessClaimSuccess,
  Side,
  SubmittedMove,
} from "@/types/chess";

type ClaimState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "claimed"; creditsRemaining: number }
  | { kind: "already_claimed" }
  | { kind: "unauthenticated" }
  | { kind: "failed"; message: string };

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/** Game-over reward CTA: submits the move history to POST /api/chess (§3.7). */
export function RewardClaim({
  moves,
  playerColor,
}: {
  moves: SubmittedMove[];
  playerColor: Side;
}) {
  const [state, setState] = useState<ClaimState>({ kind: "idle" });

  async function handleClaim(): Promise<void> {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/chess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, playerColor }),
      });
      const data = (await res.json()) as ChessClaimSuccess | ChessClaimError;
      if (res.ok && "ok" in data && data.ok) {
        setState({ kind: "claimed", creditsRemaining: data.creditsRemaining });
        return;
      }
      if (!("error" in data)) {
        setState({ kind: "failed", message: "Unexpected server response." });
        return;
      }
      switch (data.error.code) {
        case "unauthenticated":
          setState({ kind: "unauthenticated" });
          return;
        case "already_claimed":
          setState({ kind: "already_claimed" });
          return;
        default:
          setState({ kind: "failed", message: data.error.message });
      }
    } catch {
      setState({
        kind: "failed",
        message: "Couldn't reach the server — check your connection.",
      });
    }
  }

  if (state.kind === "claimed") {
    return (
      <p aria-live="polite" className="mt-2 max-w-prose text-sm text-fg">
        Reward claimed — you now have {state.creditsRemaining} JTB interactions.{" "}
        <Link href="/jtb" className={linkClasses}>
          Chat with JTB
        </Link>
        .
      </p>
    );
  }

  if (state.kind === "already_claimed") {
    return (
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        The chess reward is already claimed on this account.
      </p>
    );
  }

  if (state.kind === "unauthenticated") {
    return (
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        You won by checkmate.{" "}
        <Link href="/login" className={linkClasses}>
          Sign in
        </Link>{" "}
        and claim again to add +{CHESS_REWARD_CREDITS} JTB interactions — once
        per account.
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        You beat the Chess AI by checkmate — claim +{CHESS_REWARD_CREDITS} JTB
        interactions (once per account).
      </p>
      {state.kind === "failed" && (
        <p role="alert" className="mt-2 text-sm text-accent-exp">
          {state.message}
        </p>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          onClick={() => void handleClaim()}
          disabled={state.kind === "submitting"}
        >
          {state.kind === "submitting"
            ? "Verifying your win…"
            : `Claim +${CHESS_REWARD_CREDITS} JTB interactions`}
        </Button>
      </div>
    </>
  );
}
```

> The failed state falls back into the idle block with an alert + a live Claim button acting as retry — no separate retry UI. `void handleClaim()` keeps the click handler void-typed under strict lint.

### 5.2 MODIFY `components/chess/GameStatus.tsx` (children seam; delete placeholder copy)

The file becomes:

```tsx
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { GameResult } from "@/types/chess";

/** Live status line above the board, plus the game-over panel once a result exists. */
export function GameStatus({
  statusLine,
  result,
  onNewGame,
  children,
}: {
  statusLine: string;
  result: GameResult | null;
  onNewGame: () => void;
  /** Phase 7 seam: the reward claim UI (RewardClaim) renders here. */
  children?: ReactNode;
}) {
  return (
    <>
      <p
        aria-live="polite"
        className="mb-4 font-mono text-xs uppercase tracking-widest text-fg-subtle"
      >
        {statusLine}
      </p>
      {result && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-6">
          <p className="text-lg font-semibold tracking-tight">{statusLine}</p>
          {children}
          <div className="mt-4">
            <Button size="sm" onClick={onNewGame}>
              New game
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
```

The Phase-4 sentence (`Verified rewards land with accounts in a later phase…`) is deleted — the reward is live.

### 5.3 MODIFY `components/chess/ChessGame.tsx` (wiring only)

Add the import and derive the claim condition next to `statusLine` (around line 435); pass `RewardClaim` as the `GameStatus` child:

```tsx
import { RewardClaim } from "@/components/chess/RewardClaim";
```

```tsx
const statusLine = computeStatusLine(state);
// Phase 7: the claim CTA appears only for a genuine player checkmate win. The
// server re-verifies everything — this flag is presentation only.
const playerWonByCheckmate =
  state.result?.reason === "checkmate" &&
  state.result.winner === state.playerColor;
```

```tsx
<GameStatus
  statusLine={statusLine}
  result={state.result}
  onNewGame={handleNewGame}
>
  {playerWonByCheckmate && (
    <RewardClaim
      playerColor={state.playerColor}
      moves={state.history.map((m) => ({
        from: m.from,
        to: m.to,
        // MoveSnapshot.promotion is only ever set on promotion moves (q/r/b/n).
        ...(m.promotion
          ? { promotion: m.promotion as PromotionChoice }
          : {}),
      }))}
    />
  )}
</GameStatus>
```

`PromotionChoice` is already imported in this file. No other changes: history is frozen once a result exists (`inputOpen` closes, the AI effect early-returns), and a "New game" unmounts `RewardClaim`, resetting its state machine.

### 5.4 MODIFY `app/chess/page.tsx` (copy — replace the second paragraph)

The note about the stand-in opponent stays; the rewards clause becomes live:

```tsx
<p className="mt-4 max-w-prose text-sm text-fg-subtle">
  The trained model hasn&apos;t been exported for the browser yet, so right
  now a heuristic stand-in opponent runs through the same interface it will
  use. Beat the AI by checkmate on any difficulty while signed in to claim a
  one-time +5 JTB interaction reward.
</p>
```

### 5.5 MODIFY `app/account/page.tsx` (footnote — one sentence)

```tsx
<p className="mt-4 max-w-prose text-sm text-fg-subtle">
  JTB and the chess reward are live — the values above are your real database
  state. Employment status is audience analytics only and never gates any
  feature.
</p>
```

The `Chess reward` row (`Claimed (+5 JTB)` / `Not yet claimed`) already reads the live flag — no change there.

### 5.6 Status lines (same commit)

Update the Phase-status sentence in `CLAUDE.md`'s `## Current state` to: Phase 7 complete — chess reward verification live (`POST /api/chess`: replay from the initial position → checkmate + winner check → `claim_chess_reward` SECURITY DEFINER function; unique-gated, atomic +5) with claim UI in `/chess`. Next up: **Phase 8 — Performance** per §34 (the Data Visualisation category and its embed phase were removed 2026-08). Touch nothing else in the file — leave the fenced next-agent-rules block byte-identical. Update the equivalent `## Status` paragraph of `README.md` the same way.

### 5.7 Milestone B verification

```bash
npm run build 2>&1 | grep -E "^Failed|error"   # expect no output
npm run lint && npm run format:check            # both exit 0
grep -rn "later phases" app/chess components/chess app/account  # NO output (stale copy gone)
grep -rnE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' components/chess/RewardClaim.tsx components/chess/GameStatus.tsx  # NO output
grep -rn "playerWon\|claim" app/api/chess/route.ts | grep -i "body\|request"  # NO result verdict/FEN read from the body
```

Manual UI flow (Playwright MCP, `npm run dev`, signed in as the §3.12 test user — reset its reward first if Milestone A already consumed it: `execute_sql` delete the `rewards` row and `update profiles set chess_reward_claimed = false, credits_remaining = credits_remaining - 5 …`; state in your report that you used this dev-only reset):

1. Open `/chess`, difficulty **easy**, play as White. Scripted Scholar's mate with retry: click `e2→e4`, wait for the opponent move (`Opponent is thinking…` → `Your move`), then `f1→c4`, wait, `d1→h5`, wait, `h5→f7`. If the opponent blocked the mate (any reply other than a line this punishes), two-click resign, New game, retry — against a random opponent this lands within a handful of attempts.
2. On `Checkmate — you win`: the panel shows the claim copy and a `Claim +5 JTB interactions` button. Click it → button reads `Verifying your win…` → success line with the new balance and a `Chat with JTB` link. Confirm `/account` shows `Claimed (+5 JTB)` and balance = pre-claim + 5.
3. Click New game — panel and claim state reset (no stale `claimed` text).
4. In a **signed-out** browser context, win the same way, click Claim → the sign-in prompt with the `/login` link appears (401 mapping). Copy is the §5.1 `unauthenticated` block.
5. Re-attempt a claim as the same user after the reward is claimed (second scripted win, or one more click if the panel allows) → API returns 409 and the panel shows the already-claimed sentence. (If a second genuine win is tedious, verify the 409→already-claimed mapping by code review against the Milestone-A matrix row 7 and say so in the report.)

If any UI step cannot be exercised, state exactly which and why in the final report — do not fake it.

### 5.8 Commit (single, conventional)

```
feat(chess): add reward claim UI and live reward copy

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 6. Drift risks — read before starting

| Risk | Guardrail |
|---|---|
| "Verify" the win from a client-sent `result`/`winner`/`playerWon` field | Request schema has moves + color only (§3.2). The SQL-grep in §5.7 is a tripwire. |
| Accepting a client FEN so a prefab mate position "replays" instantly | `replayMoves` is called with NO `fen` argument — always the standard initial position (route step 4). |
| Awarding via a direct `profiles.update` from the route (blocked by Phase 6 column lock + dropped insert policies, and non-atomic) | All credit mutation lives inside `claim_chess_reward`; route only calls the RPC. |
| Double award under concurrent requests (two wins claimed at once) | `unique(user_id, reward_type)` + `ON CONFLICT DO NOTHING`; the 409 race branch in the route. |
| Trusting the pre-check as the gate | Pre-check is UX only; the unique constraint enforces. Both paths exist and both were tested (matrix rows 6–7). |
| New deps (chessboard libs, zod) or new env vars | Hard rule 1; `npm ls` count check in §4.5. |
| `getSession()` for route auth (trusts the cookie unverified) | `auth.getUser()` in the route, same as JTB. |
| Making `/chess` dynamic or gating the page on auth | Page stays static (§3.8); signed-out winners get the sign-in prompt **after** clicking Claim. |
| Auto-submitting on any client flag at game end | Explicit Claim button only (§3.8). |
| MCP stamps its own migration version | §4.1 step 2 realign check, as in Phase 5. |
| Hand-editing `types/supabase.ts` | Regenerate via `generate_typescript_types` after applying (§4.1 step 4). |
| Implying the server verified the *opponent's identity* | §1 context paragraph — it verifies a legal game won by the caller; say exactly that. |
| Deleting `.gitkeep` files or creating `lib/rewards/*.ts` | §3.5 / hard rule 5 — one caller, inline RPC, JTB pattern. |
| Prettier reformatting this plan | `*.md` is prettier-ignored; still run `npm run format` only via `format:check` expectations on code files. |

## 7. Execution order (exact)

**Milestone A** — commit once at the end:
1. `supabase/migrations/20260825120000_claim_chess_reward.sql`
2. MCP: apply migration → function check → history realign → advisors → regenerate `types/supabase.ts` (§4.1)
3. `types/chess.ts` additions (§4.2)
4. `lib/chess/constants.ts`, `lib/validation/chess.ts` (§4.3)
5. `app/api/chess/route.ts` (§4.4)
6. Repo checks + Playwright API matrix + SQL assertions (§4.5 — every row) → fix → commit with the given message.

**Milestone B** — commit once at the end:
1. `components/chess/RewardClaim.tsx` (§5.1)
2. `components/chess/GameStatus.tsx` children seam + placeholder deletion (§5.2)
3. `components/chess/ChessGame.tsx` wiring (§5.3)
4. `app/chess/page.tsx` + `app/account/page.tsx` copy (§5.4–5.5)
5. `CLAUDE.md` + `README.md` status lines (§5.6)
6. Checks + manual UI flow (§5.7) → commit with the given message.

## 8. Definition of done (§28 Phase 7 items + §32 Chess rows, vs. what waits)

Satisfied by this phase:
- [ ] Game history submission: `POST /api/chess` accepts `{ moves, playerColor }` only, hand-validated (§3.3)
- [ ] Server-side replay from the standard initial position via the existing isomorphic `replayMoves` (§3.5 step 4)
- [ ] Win verification: legal game, terminal checkmate, winner equals caller's color (§3.5 step 5) — color-lie vector proven to 422
- [ ] Reward validation: once-per-user enforced by `unique(user_id, reward_type)` inside `claim_chess_reward` (§4.1), plus a pre-check for clean UX
- [ ] Atomic credit update: reward row + `+5` + `chess_reward_claimed` in one transaction (§4.1); only the function mutates credits
- [ ] Reward confirmation UI: Claim button → verifying → claimed/already-claimed/sign-in/failed states (§5.1–5.3)
- [ ] §32 Chess rows now true: "Completed games can be verified server-side", "Winning awards +5 JTB credits", "Reward cannot be claimed repeatedly"
- [ ] §21/§33.13: no client-trusted chess reward claim anywhere; 401 unauthenticated; balance comes only from the DB
- [ ] `build`, `lint`, `format:check` green; zero new deps/env vars; migration history realigned; `types/supabase.ts` regenerated; gitkeeps intact

Explicitly NOT satisfied here (later phases — say so in your report, do not fake):
- [ ] The trained ONNX chess model (`TODO(MODEL)` in `lib/chess/opponents.ts`; §34 step 9) — opponents remain the honest heuristic stand-ins
- [ ] JTB KB `projects`/`faq` placeholders (content tasks)
- [ ] Login `?next=` redirect-after-signin (V1 scope decision — noted, not built) 
- [ ] Production smoke of `/api/chess` on the Vercel domain (no new env needed — it works on deploy; smoke it then)
- [ ] Reward rate limiting (rejected, §3.7 decision 7), PGN export, leaderboard/multiplayer (§29 — never)

And as always: no fabricated portfolio copy; honesty markers where the real model isn't wired; the final report states exactly which verification steps ran (API matrix rows, SQL results, UI script attempts) and which code paths were verified by review only.
