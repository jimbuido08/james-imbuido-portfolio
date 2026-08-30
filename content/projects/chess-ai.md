---
title: "Chess AI"
category: AI
description: "A fully playable chess game where the rules engine decides every legal move and the opponent runs entirely client-side — no server picks a move. Beat it on any difficulty while signed in for a one-time +5 JTB credit reward, verified by replaying your moves on the server."
featured: true
interactive: true
technologies:
  - Next.js
  - TypeScript
  - React
  - chess.js
  - Next.js server routes
  - Postgres
  - Supabase
problem: "Two problems, and they have to be solved in the right order. The trained chess model does not yet exist as an exportable browser artifact, so shipping 'the chess AI' today would mean presenting a placeholder as a neural network — the honest options are a disclosed stand-in or nothing. And the credit economy cannot trust the client: any browser can claim 'I won', so a reward must be derivable from the moves alone, replayed by the server, and awarded at most once per user."
models: "A single opponent interface with three difficulty stand-ins behind it, all of which may only pick among the legal moves the rules engine hands them — the engine, not the opponent, is the authority on what is legal. Easy chooses uniformly at random. Medium scores single moves by captured material with a check bonus. Hard evaluates material with a small centrality term using negamax with alpha-beta pruning. The rules engine is an isomorphic module with no React or DOM imports, so the exact same code validates a browser board and replays a server-side reward claim. Trained weights are not published yet; the same interface will load them via ONNX Runtime Web from a dedicated models directory."
evaluation: "There is no deployed neural network, so there are no accuracy metrics to claim. What is verified instead is the reward path: the server replays the submitted move list from the initial position through its own rules engine, requires a legal game of at most 300 submitted moves ending in checkmate won by the submitter, rate-limits claim attempts (10 per 60 seconds, counted per attempt rather than per success), and enforces once-per-user with a unique-gated database function. Credits live only in Postgres; the balance the browser displays is a projection of database state, never the authority."
approach: "Build the game completely and the model last. Board, legal-move validation, game state, termination, and three difficulties all ship behind one opponent interface, so the trained model is a drop-in replacement rather than a rewrite. The UI never applies an opponent's move directly — it passes the chosen move back through the engine's validator, which means a bad opponent can produce a slow or dull move but never an illegal one. The board is hand-built from the design-token palette, and the reward flow is a separate replay-and-verify layer rather than anything the browser asserts."
results: "The game is playable in the browser across all three difficulties, wins are one-time credit rewards, and every claim is verified rather than trusted. The behaviour on unhappy paths is the interesting part: resubmitting an already-claimed win is answered as already-claimed, an illegal move list is rejected together with the index of the first illegal move, and a loss or draw is rejected as not a win. The opponent is described in the UI as a heuristic stand-in until the trained model ships — that copy is part of the deliverable, not a disclaimer."
lessons: "Designing the model seam before the model pays for itself: three wholly different opponents exposed the interface early, and nothing needs to change when real weights land. Keeping the rules engine isomorphic turned out to be the load-bearing decision — the same module that renders the board performs the server replay, so there is exactly one rules implementation to trust. And in a credit economy, the interesting engineering is rarely the game itself; it is refusing to trust the client that played it."
demoUrl: "/chess"
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->