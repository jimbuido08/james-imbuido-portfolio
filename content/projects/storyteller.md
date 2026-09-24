---
title: "Storyteller — a 6.9M-Parameter GPT Trained From Scratch"
category: LLM
description: "James's own decoder-only GPT — 6,917,376 parameters with RoPE, SwiGLU, and tied embeddings — trained from scratch on a home PC over 66.7M tokens of TinyStories, then hand-ported to TypeScript so visitors can generate short stories entirely in their browser."
featured: true
interactive: true
technologies:
  - Python
  - PyTorch
  - Hugging Face tokenizers
  - NumPy
  - TypeScript
  - Web Workers
  - Next.js
problem: "Most portfolio AI demos call someone else's API. This one had to be the real thing: a language model whose data pipeline, tokenizer, architecture, and training loop were all written by hand, cheaply, on a home PC with no CUDA GPU — and then made to run on any visitor's device with no server and no ML framework in the browser."
data: "66,674,390 training tokens of TinyStories (300,000 synthetic children's stories streamed from Hugging Face) and 382,823 validation tokens (2,000 stories), packed as flat uint16 streams with one [EOT] token ending every story. The byte-level BPE tokenizer was also trained from scratch: an 8,192-token vocabulary and 7,935 merges with GPT-2 pre-tokenization."
models: "pc-tiny — a 6-layer decoder-only transformer at the modern small-LLM recipe scaled down: n_embd 256, 8 heads (head_dim 32), context 256, pre-RMSNorm (eps 1e-6), interleaved-pair RoPE, a SwiGLU feed-forward (704-unit hidden, derived as 8/3 · n_embd rounded up to a multiple of 64), tied input/output embeddings, and no biases anywhere. 6,917,376 parameters, shipped as a 13,834,784-byte fp16 STOR container (32-byte header, CRC32)."
evaluation: "Validation loss on held-out stories every 100 steps (41 recorded eval points) and a fixed-prompt sample every 250 steps (16 recorded mid-train samples). Cross-language parity is gated, not assumed: npm run verify:storyteller-model checks exact tokenizer encode/decode fixtures (including contractions, CJK, emoji, and the [EOT] literal), container integrity (CRC32, header, corruption rejection), forward-pass logits against Python-generated fixtures, exact greedy next-token ids, and exact seeded generations recorded from the shipped fp16 container."
approach: "Everything was built and trained on CPU (a Ryzen 5 7500F): 4,000 AdamW steps at batch 32 × context 256 with warmup + cosine decay (peak 1e-3 to 10%), weight decay 0.1, and grad clip 1.0 — about 100 minutes. For the portfolio, the inference path was hand-ported to TypeScript over Float32Array (forward pass, RoPE, KV-cached generation, top-k sampling; no ONNX, no framework) so the model writes stories in a web worker on the visitor's device. A numpy mirror plus the verify gate prove the port agrees with the trained weights, and every browser expectation is recorded from the shipped fp16 container, never the fp32 master."
results: "Validation loss fell from 8.97 to 2.006 — perplexity 7.4 — at roughly 5,500 tokens/second on CPU. Early samples are noise; by mid-training, words form; the final model writes coherent children's-style tales with a small model's honest quirks — invented characters that drift mid-story and no guaranteed ending. The 13.8 MB fp16 model loads in a browser tab and generates with zero server inference."
lessons: "The modern recipe (RMSNorm, RoPE, SwiGLU, tied heads) scales down cleanly and trains fast on CPU. The riskiest seam was not the model but the tokenizer port — GPT-2 regex and byte-level mapping fidelity — and exact fixtures caught every edge case. fp16 quantization changes generations, so all browser expectations are recorded from the shipped container (the chess lesson, twice over). At this scale the hard engineering is the contract — container format, cross-language gate, honest failure copy — not the model."
githubUrl: "https://github.com/jimbuido08/llm-from-scratch"
demoUrl: "/storyteller"
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->