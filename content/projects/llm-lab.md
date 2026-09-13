---
title: "LLM Lab — Train a Tiny LLM in the Browser"
category: LLM
description: "A five-step workflow where visitors train a tiny byte-level transformer live in a web worker — pick a corpus, watch the loss fall, sample text, keep the model file — plus a 481,344-parameter sample James trained on this site's approved copy. No ML framework anywhere; forward, backward, and Adam are hand-written TypeScript over Float32Array."
featured: true
interactive: true
technologies:
  - TypeScript
  - Next.js
  - React
  - Web Workers
  - Float32Array numerics
  - Node.js (tsx)
  - NumPy
problem: "Most 'try a model' demos hide everything interesting behind an API call: text goes in, text comes out, and the mechanism stays invisible. For a portfolio's LLM entry I wanted the mechanism itself to be the demo — training, not just inference — which rules out any server GPU and demands the whole thing run on whatever device a visitor holds, with honest copy about what sixty seconds of browser compute can and cannot teach a model."
data: "Three visitor corpora, all inspectable on the page: a 49,430-byte public-domain Shakespeare excerpt bundled with the site (deterministically sliced from Tiny Shakespeare's 1,115,394 bytes), an 18,003-byte excerpt of this site's approved copy regenerated from the JTB knowledge base sections, and whatever the visitor pastes or points at by URL — fetched client-side only, with CORS failures explained rather than proxied around. The shipped sample was trained on the 18,003-byte portfolio corpus: tiny on purpose, so the model visibly memorises and remixes the site rather than pretending to be a grounded chatbot."
models: "A pre-LN decoder-only transformer with a byte vocabulary (256 tokens — one per UTF-8 byte), learned positional embeddings, GELU MLPs, and a tied output head. Visitors pick nano (120,576 parameters), small (481,344), or mini (842,496); the shipped sample is the small preset serialised to fp16, a 962,720-byte artifact in a custom 'JLLM' container (32-byte header, CRC32, fixed weight order)."
approach: "There is no ML framework at runtime: the forward pass, backward pass, Adam, and sampler are hand-written over Float32Array arenas in lib/llm/, and the same modules run in three places — the browser worker (which owns training so the UI never janks, and honours a real cancel between optimizer steps), the offline tsx trainer that produced the sample (trainModel, same code path, bigger batch), and the verify gate. Determinism comes from one seeded mulberry32 stream split into init/batch/eval substreams. A numpy reference implementation exists purely adversarially: it mirrors the math independently and is finite-difference-gradient-checked before its fixtures are allowed to become golden values."
evaluation: "npm run verify:llm-model gates the contract in 27 checks: tokenizer cases including multibyte, exact PRNG streams, init/forward/loss parity against numpy (max diff 5.02e-8 on forward probs), one Adam step to post-step weights and loss parity, byte-identical artifact sha256 across the two languages for both fp32 and fp16, corrupt-container rejection, and exact seeded generations recorded from the shipped artifact itself."
results: "Measured on a mid-range Windows desktop: pure-JS matmul sustains 1.7–2.1 GFLOP/s, so the visitor default (nano, ~180 calibration-scaled steps) lands near a one-minute train; an 80-step run on the bundled excerpt moved loss from 5.5 to 2.9 nats/byte in 17 seconds and its samples shifted from noise to word fragments. The shipped sample trained 500 steps at batch 32 in about 40 minutes to 1.09 nats/byte on the portfolio corpus, and now recites and remixes the site — 'Data Scientist', CBA acronyms, and all — which is exactly the point the page copy makes."
lessons: "The browser is a fine tiny-model trainer if you write the kernels plainly and let Float32Array JIT; the bottleneck is UX, not FLOPs, so the entertainment is the falling loss curve and the mid-train samples. Verification architecture matters more than model quality at this scale: mirroring one math core into a second language and gate-checking it caught real bugs early (a position-embedding cross-batch leak and a snapshot-after-mutate test bug), and recording generation expectations from the shipped fp16 file — not the fp32 master — repeats the chess quantization lesson. Finally, honest framing is a feature: a model that visibly memorises an eighteen-kilobyte corpus teaches more about what language models are than a polished API demo would."
demoUrl: "/llm-lab"
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->
