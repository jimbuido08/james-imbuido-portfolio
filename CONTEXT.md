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

## Current state (2026-08-27)

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
- **Architecture deepenings (Streams A–C) committed.** See the map below.

## Architecture map

### Decision cores (policy, no I/O)
- `lib/jtb/turn.ts` — the §5.1 JTB turn: auth → credits → rate limit → validate
  → LLM → deduct-on-success. Deps injected; every branch exercisable without
  live infra.
- `lib/chess/claim.ts` — the §3.7 chess claim: profile → rate limit → replay →
  win check → atomic award. Deps injected; clock injected for the rate window.
- `lib/contact/submit.ts` — the §22 contact submission: rate-limit pre-check →
  rate-checked insert RPC. Deps injected; clock injected for the rate window.

### Single sources of truth
- `lib/navigation.ts` — the route registry. Header and universe nodes derive
  from it.
- `lib/credits/constants.ts` — the credits vocabulary (10 new-user, +5 chess).
- `lib/content/trust.ts` — placeholder rules.
- `lib/universe/config.ts` — node registry, palette mirror, quality profiles.
  Validated at module load (unique node ids).

### Degradation paths (load-bearing)
- Homepage: hero copy is server-rendered; the canvas is a lazy
  `next/dynamic({ ssr: false })` chunk gated on `mounted && webgl` (hydration-safe).
- `prefers-reduced-motion` freezes the scene and navigates instantly.
- Mobile gets a reduced quality profile.

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
- All project case studies are `[TODO: James — …]` placeholders — never fabricate.

## How to verify

- `npm run lint` · `npm run build` (type-check + 10 static pages incl. `/ai-ml/[slug]` SSG) · `npm run format:check`
- For a policy core: write a `.verify-*.mts` harness, run `npx tsx`, delete it.
- Browser check (no screenshots): playwright a11y snapshot + console messages.
