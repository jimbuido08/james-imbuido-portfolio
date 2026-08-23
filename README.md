# James Imbuido — Interactive Data Universe Portfolio

A personal portfolio for **James Imbuido, Data Scientist** — built not as a conventional résumé site but as an **interactive data universe**: a full-screen 3D environment where visitors navigate James's career, machine-learning work, AI systems, and data visualisation projects by exploring nodes orbiting a central "data core".

The guiding idea is *show, don't tell* — the portfolio itself demonstrates the skills it describes. Visitors can talk to **JTB** (an AI chatbot grounded strictly in curated information about James), play chess against a **custom client-side chess model**, and explore real Tableau, Power BI, and Python visualisation work — including his path from nursing into data science and his experience at Commonwealth Bank of Australia.

## Status

**Pre-development (Phase 0).** The repository currently holds the authoritative spec — the [Master Project Plan](<./James Imbuido — Interactive Data Universe Portfolio _ Master Project Plan.md>) — covering the product concept, routes, data models, security invariants, V1 scope, and the phased build order. The Next.js application has not been scaffolded yet; setup and run instructions will land with the Phase 0 scaffold.

## Key features (planned)

- **Data Universe** — a React Three Fiber scene as the homepage's primary navigation, with a full conventional-navigation fallback so the entire site works without WebGL, on mobile, and with reduced motion.
- **JTB chatbot** — authenticated and credit-based (10 free interactions, +5 for beating the Chess AI), grounded exclusively in an approved knowledge base. It never invents facts.
- **James Chess AI** — a fully playable game against a custom model that runs entirely in the browser. Wins are verified server-side by replaying the submitted move history before any reward is granted.
- **ML & Data Visualisation labs** — filterable project galleries with structured case studies and embedded Tableau / Power BI dashboards.

## Tech stack

- **Frontend:** Next.js (App Router), TypeScript, React, Tailwind CSS, Framer Motion
- **3D:** Three.js, React Three Fiber, `@react-three/drei`
- **Chess:** chess.js-style rules engine + a custom client-side model (ONNX Runtime Web or TensorFlow.js)
- **Auth & data:** Supabase (Auth, PostgreSQL, Row Level Security)
- **Hosting:** Vercel, with GitHub → preview → production deployments

All server-side logic — chatbot, credits, chess-reward verification, contact form — lives in Next.js server routes. There is deliberately no separate backend for V1.

## Security principles

A few rules are load-bearing:

- The LLM API key is server-only and never reaches the browser.
- JTB credit balances are checked and deducted server-side, only after a successful response.
- Chess rewards are granted only after the server replays and verifies the game's full move history — the client is never trusted to report "I won".
- Row Level Security protects all user data; the plan favours collecting as little personal data as possible.

## Documentation

- [Master Project Plan](<./James Imbuido — Interactive Data Universe Portfolio _ Master Project Plan.md>) — the full spec; read this first.
- [CLAUDE.md](./CLAUDE.md) — operational guidance for AI-assisted development in this repository.
