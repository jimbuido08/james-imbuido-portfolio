# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Phase 1 (§28) laid the foundation (design tokens in `app/globals.css`, `cx` helper, UI primitives in `components/ui/`, `Header`/`Footer` shell, `/design` preview) and **Phase 2 (§28) is complete**: the homepage is a full-viewport **Data Universe prototype** — a central data core orbited by five navigation nodes, faint core→node connection lines, and a particle starfield, all under React Three Fiber. Hover highlights a node and shows a DOM label chip; clicking glides the camera to the node and navigates to its route. The scene is built from small modular components in `components/universe/` (`DataUniverse` → dynamic-imported `UniverseCanvas` → `UniverseScene` → `Environment`/`ParticleField`/`DataCore`/`NodeGroup`/`LiveLines`/`CameraTransition`/`UniverseOverlay`), with `lib/universe/config.ts` as the single source of truth (node registry, palette mirror, quality profiles — the only file holding 3D hex literals) and `lib/universe/webgl.ts` as the SSR-safe support probe.

Degradation is load-bearing: hero copy is server-rendered (crawlable, no-JS), the WebGL-less path renders no canvas yet keeps full content + navigation, `prefers-reduced-motion` freezes the scene and navigates instantly on node click, and mobile gets a reduced quality profile. `three`/`@react-three/*` live only in a lazy chunk via `next/dynamic({ ssr: false })` inside the client `DataUniverse` — never in the `/` main bundle.

`/about` and `/experience` now render real content (About bio; career/education timeline); `/ai-ml`, `/jtb`, `/chess` remain honest, clearly-marked placeholders. **Contact form (§22) complete** — anonymous form at `/contact` (`components/contact/ContactForm.tsx`, honeypot + client length limits) posting to `POST /api/contact`, which hashes the client IP (`CONTACT_IP_SALT`-salted sha256) and stores messages via SECURITY DEFINER RPCs into `contact_messages` (RLS, zero policies — clients never read or write it; James reads via the Supabase dashboard). Rate limit is per-IP-hash, 5/hour, enforced authoritatively inside `record_contact_message` so direct RPC calls with the public key are still bounded. No email provider — messages are dashboard-read only. **Phase 5 complete** — Supabase email/password auth (`/login`, `/signup`, `/account`), SSR clients + `proxy.ts` session refresh, and the `profiles`/`chat_interactions`/`rewards` schema with RLS applied to the hosted project. **Phase 6 (JTB) complete** — auth-gated chat at `/jtb` (`components/jtb/` UI, credits badge, exhausted state) with `POST /api/jtb` implementing the full §5.1 flow: auth → credit pre-check → rate limit → validate → load KB → Ollama call → atomic `deduct_credit` only after success → `record_chat_interaction` (metadata only). Grounding is a fail-closed loader in `lib/jtb/knowledge-base.ts` over `content/jtb/` (6 of 9 sections live, populated from the About/Experience content plus James's certifications; `projects`/`faq` still placeholders). Verified end-to-end against the hosted project: real Ollama reply on model `gpt-oss:120b`, exactly one credit deducted, zero deducted on failure, unauthenticated calls 401. Bug found by that test and fixed: `DEFAULT_OLLAMA_BASE_URL` is the bare host `https://ollama.com` — the client appends `/api/chat`. JTB grounds answers by stuffing the whole KB into the system prompt (not RAG); the decision and a future RAG path are documented in `docs/notes/jtb-grounding-architecture.md`. **Phase 7 complete** — chess reward verification live (`POST /api/chess`: replay from the initial position → checkmate + winner check → `claim_chess_reward` SECURITY DEFINER function; unique-gated, atomic +5) with claim UI in `/chess`. The **Data Visualisation category was removed in 2026-08** to focus the site on the remaining domains: `/data` routes, the Tableau/Power BI embed layer, and the Phase 8 plan doc are gone, and the universe rebalances five nodes at 72°.

**Architecture deepenings (Streams A–C) complete** — server and content layers reworked into decision cores with injected deps (`lib/jtb/turn.ts`, `lib/chess/claim.ts`), single-source registries (`lib/navigation.ts`, `lib/credits/constants.ts`, `lib/content/trust.ts`, `lib/content/markdown.ts`), and a consolidated universe layer (`NodeGroup` renders every node; `LiveLines` draws core→node lines from the shared `nodePositions` registry; the node registry validates at module load). The chess claim is rate-limited via `chess_claim_attempts`, and the WebGL gate is hydration-safe (`mounted && webgl`).

**Source of truth:** `James Imbuido — Interactive Data Universe Portfolio _ Master Project Plan.md`. It defines the product, routes, data models, security rules, V1 scope, and a strict build order. Read the relevant sections before any substantial work — do not guess at requirements the plan already specifies. Section numbers below (§N) refer to that file.

## Commands

Standard Next.js App Router app, npm only (§14, §28 Phase 0): `npm install`; `npm run dev` (dev server, http://localhost:3000); `npm run build` (production build + type-check); `npm run start`; `npm run lint` (ESLint flat config); `npm run format` / `npm run format:check` (Prettier; `*.md` docs excluded by `.prettierignore`). No test framework by design; "done" is defined by the acceptance checklist in §32, not by test coverage.

## What this project is

A personal data-science portfolio whose homepage is a full-screen 3D "Data Universe" (React Three Fiber): a central data core representing James, orbited by nodes for About, Experience, AI/ML, JTB (a chatbot), and Chess AI. Nodes are navigation — clicking one transitions the camera into the matching section.

Non-negotiable: **the 3D layer is an enhancement, never the only path.** Every node mirrors a conventional route, and the entire site must work without WebGL (accessibility, SEO, mobile) (§11.1, §31 Principle 5).

## Decided stack — do not re-litigate (§14)

- Next.js App Router + TypeScript (strict, avoid `any`) + Tailwind + Framer Motion.
- Three.js via React Three Fiber + `@react-three/drei` — used selectively, lazy-loaded, optimised aggressively (geometry, particle counts, DPR, animation loops).
- Chess: a chess.js-style rules engine kept conceptually separate from the model — rules determine legality, the model only picks among legal moves. The model runs entirely client-side (ONNX Runtime Web, or TF.js if the trained model demands it — decide at implementation time, §3.6, §14.2).
- Supabase for Auth + PostgreSQL + Row Level Security. Never hand-roll password storage; use Supabase's current Next.js SSR auth pattern (§4.2).
- Vercel hosting. All server logic (JTB, credits, chess-reward verification, contact form, usage tracking) lives in Next.js server routes/server actions.

Explicitly out of scope for V1 (§29): FastAPI/Python backend, CMS, blog, chess leaderboard or multiplayer, social login, admin dashboard, microservices, public chat history. Do not introduce them.

## Security invariants (§21 — treat as unbreakable)

- The LLM API key never reaches the browser; JTB calls happen only in server routes.
- JTB credit counts live only in the database. Server flow per §5.1: validate auth → check credits → call LLM → deduct one credit **only after a successful response** (failed requests deduct nothing). Never trust a browser-reported balance.
- Chess reward: never trust a client "I won". The client submits the full move history; the server authenticates, replays the game with a trusted rules implementation, confirms legality and the win, confirms the reward is unclaimed, then atomically awards credits (§3.7).
- Constants: new users get **10** JTB interactions; beating the Chess AI grants **+5**, once per user (§3.7, §5).
- RLS on all user tables; never trust client-provided user IDs.
- Registration collects only email, password, and employment status. Employment status is audience analytics — it must never gate features or privileges (§4.1).

## Content integrity

- JTB is grounded exclusively in approved markdown under `content/jtb/` (§7). It must never invent experience, projects, metrics, employers, or technologies — **and neither should you**: do not fabricate portfolio copy or achievements. Use clearly-marked placeholders and flag them for James to fill.
- Projects follow the structured content model in §23 and the case-study template in §8.1. Never fabricate metrics in case studies.

## Structure and routing (§10, §15, §16)

Planned routes: `/` (Universe), `/about`, `/experience`, `/ai-ml` + `/ai-ml/[slug]`, `/jtb`, `/chess`, `/contact`, `/login`, `/signup`, `/account`.

Target layout (§15): `app/` routes plus `app/api/{jtb,chess,rewards,contact}`; `components/universe/` kept modular (DataUniverse → UniverseScene → Environment/ParticleField/DataCore/UniverseNodes — never one giant 3D component, §16); `lib/supabase/{client,server}.ts` as separate browser/server clients; `content/` for the JTB knowledge base and projects as structured markdown; `supabase/migrations/` for schema.

## Performance and accessibility constraints (§17, §18)

- The homepage must not download the chess model, chatbot dependencies, or project assets until needed — use dynamic imports throughout.
- Mobile is not a shrunken desktop: reduced particles/effects/scene complexity, tap navigation, on-demand loading (§27).
- Honour `prefers-reduced-motion`; transitions are short, smooth, skippable; no forced intro animation (§11).
- Theme via CSS variables/design tokens, not hard-coded colours (§12). Dark, minimal, restrained palette — avoid neon/glow/glassmorphism excess.

## Build order — follow it sequentially (§34)

Do not build every system simultaneously:

skeleton → design system → conventional portfolio pages → Universe prototype → Universe→page navigation → ML project system → chess UI → client-side chess model → Supabase auth → JTB → credit system → chess-reward verification → performance → accessibility → SEO → analytics → final polish → production deploy.

First milestone: a beautiful Data Universe that navigates to placeholder portfolio sections; only then connect real content and systems.

## Working rules (from §33)

- Inspect existing code before writing; never overwrite functionality without reading it first.
- Small reusable components; no unnecessary abstractions; add a dependency only for a concrete requirement.
- Validate all server-side inputs; include loading, error, and empty states; responsive from the start.
- Ambiguous design choice → prefer the simplest implementation that preserves the intended UX. Technically expensive feature → prototype the UX before committing to architecture.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
