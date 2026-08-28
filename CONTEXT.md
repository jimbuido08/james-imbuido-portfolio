# CONTEXT.md — James Imbuido portfolio

Working snapshot for AI agents. CLAUDE.md holds the rules and master-plan
references; this file holds *where the code actually is right now*. If the two
disagree, this file is stale — update it.

## What this is

A personal data-science portfolio. The homepage is a full-viewport 3D "Data
Universe" (React Three Fiber): a central core orbited by five navigation nodes
(About, Experience, AI/ML, JTB, Chess AI). The 3D layer is an
enhancement, never the only path — every node mirrors a conventional route and
the site works without WebGL (§11.1).

## Current state (2026-08-28)

- **Phases 1–7 complete.** Design system, conventional pages, Universe, Supabase
  auth, JTB chatbot (Ollama, credits), chess reward verification (server replay +
  atomic +5).
- **Contact form (§22) complete (2026-08-27).** Anonymous form at `/contact`
  posts to `POST /api/contact` → `lib/contact/submit.ts` → SECURITY DEFINER RPCs
  into `contact_messages` (RLS, zero policies). Per-IP-hash rate limit (5/hour),
  honeypot, no email provider — James reads messages in the Supabase dashboard.
- **Data Visualisation removed (2026-08-27).** The `/data` routes, the Tableau /
  Power BI embed layer, and the visualisation content are gone to focus the site
  on the remaining domains. The universe rebalances five nodes at 72°.
- **JTB RAG (2026-08-28).** Grounding is per-section retrieval with whole-KB
  fallback: `content/jtb/` is chunked (at `###` boundaries, `lib/jtb/chunking.ts`)
  and indexed into the hosted chunk-level `jtb_chunks` pgvector table (384-dim
  gte-small) by `npm run kb:sync` (service-role key, local machine only);
  `/api/jtb` embeds each message via the `jtb-embed` Supabase Edge Function
  (`supabase/functions/jtb-embed/`, supabase.ai gte-small, role-checked Bearer
  auth — user access token on the request path, service key in kb:sync) and
  retrieves top-12 chunks via the SECURITY DEFINER `match_jtb_chunks` RPC,
  max-pools their scores to sections, and keeps the top-4 sections ≥ 0.81.
  Any retrieval failure/below-threshold falls back to whole-KB stuffing, so
  retrieval can only cost tokens, never the reply. Both providers run over
  HTTPS, so retrieval works identically in dev and on Vercel. See
  `docs/notes/jtb-grounding-architecture.md` (also documents the edge-function
  546 CPU kill → sub-batching in `lib/jtb/embeddings.ts`).
- **Architecture deepenings (Streams A–C) committed.** See the map below.

## Architecture map

### Decision cores (policy, no I/O)
- `lib/jtb/turn.ts` — the §5.1 JTB turn: auth → credits → rate limit → validate
  → KB gate → retrieve → LLM → deduct-on-success. Deps injected; every branch
  exercisable without live infra.
- `lib/jtb/retrieval.ts` — the never-throw retrieval policy: embed → top-12
  chunks RPC → max-pool to sections → threshold → top-k. Every failure returns
  `{ ok: false, reason }` → whole-KB fallback.
- `lib/jtb/embeddings.ts` — the jtb-embed edge-function client (sub-batched to
  dodge the 546 CPU kill). Server-only; callers pass a Bearer token.
- `lib/chess/claim.ts` — the §3.7 chess claim: profile → rate limit → replay →
  win check → atomic award. Deps injected; clock injected for the rate window.
- `lib/contact/submit.ts` — the §22 contact submission: rate-limit pre-check →
  rate-checked insert RPC. Deps injected; clock injected for the rate window.

### Single sources of truth
- `lib/navigation.ts` — the route registry. Header and universe nodes derive
  from it.
- `lib/credits/constants.ts` — the credits vocabulary (10 new-user, +5 chess).
- `lib/content/trust.ts` — placeholder rules.
- `lib/jtb/knowledge-base.ts` — per-section KB loader + `formatKnowledgeBaseSections`
  (the ONE framing owner: retrieved context and the whole-KB string are framed
  identically).
- `lib/jtb/constants.ts` — retrieval constants (`RETRIEVAL_TOP_K`,
  `RETRIEVAL_MATCH_COUNT`, `RETRIEVAL_MIN_SIMILARITY = 0.81`,
  `EMBEDDING_DIM = 384` — must equal the `vector(N)` in the jtb_chunks
  migration) + provider defaults.
- `lib/universe/config.ts` — node registry, palette mirror, quality profiles.
  Validated at module load (unique node ids).

### Degradation paths (load-bearing)
- Homepage: hero copy is server-rendered; the canvas is a lazy
  `next/dynamic({ ssr: false })` chunk gated on `mounted && webgl` (hydration-safe).
- `prefers-reduced-motion` freezes the scene and navigates instantly.
- Mobile gets a reduced quality profile.
- JTB retrieval: `embed_failed | rpc_failed | no_rows | below_threshold |
  model_mismatch` → whole-KB stuffing; only an unreadable KB (loader gate,
  before retrieval) still yields `kb_unavailable` 503.

## Key decisions

- **No test framework by design** (CLAUDE.md). Verification is throwaway
  harnesses: `npx tsx .verify-*.mts` with in-memory deps, then deleted.
- **Deep modules over fat routes.** Routes are thin adapters; policy lives in
  `lib/*` decision cores with injected Supabase/LLM deps.
- **One constellation, one renderer.** `NodeGroup` renders every node and
  `LiveLines` draws core→node lines from the shared `nodePositions` registry —
  no parallel subsystem for sub-nodes.

## In flight / pending

- `content/jtb/`: `projects` and `faq` sections still placeholders.
- After editing any `content/jtb/` file, run `npm run kb:sync` (or
  `npm run kb:sync -- --check` to see drift) — otherwise retrieval serves the
  pre-edit snapshot while the fallback serves the new text.
- All project case studies are `[TODO: James — …]` placeholders — never fabricate.

## How to verify

- `npm run lint` · `npm run build` (type-check + 10 static pages incl. `/ai-ml/[slug]` SSG) · `npm run format:check`
- For a policy core: write a `.verify-*.mts` harness, run `npx tsx`, delete it.
- Browser check (no screenshots): playwright a11y snapshot + console messages.
