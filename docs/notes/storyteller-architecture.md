# Storyteller — architecture notes

The storyteller is the showcase for James's from-scratch LLM (the standalone
`dev/llm-from-scratch` repo): visitors type a prompt and the trained model
writes a story entirely in their browser. This note records the contract, the
gates, and the decisions — written 2026-09-23, all numbers measured.

## 1. Verified facts

- Model: pc-tiny — 6 layers, n_embd 256, 8 heads (head_dim 32), ctx 256,
  vocab 8,192, SwiGLU hidden 704 (derived: `int(d·8/3)` rounded up to a
  64-multiple), pre-RMSNorm eps 1e-6, interleaved-pair RoPE (base 10,000),
  tied embeddings, no biases, no dropout.
  6,917,376 parameters; trained 4,000 AdamW steps (batch 32 × ctx 256,
  warmup + cosine 1e-3 → 10%, wd 0.1, clip 1.0) over 66,674,390 TinyStories
  tokens in ~100 min on a Ryzen 5 7500F — val loss 8.97 → 2.006 (ppl 7.4).
- Checkpoint keys are `h.{i}.*` (ModuleList dots); `wte.weight` and
  `lm_head.weight` alias one storage — the export asserts the tie and writes
  `wte` exactly once.
- RoPE tables are `persistent=False` — not in the checkpoint; both the numpy
  mirror and the TS port recompute them (tables `[ctx × headDim/2]`).

## 2. The contract

**"STOR" v1 container** (32-B LE header + fp16 payload; writer:
`training/storyteller/export.py`, reader: `lib/storyteller/container.ts`):
magic "STOR", u16 version, u8 dtype (1=fp16), u8 flags (bit0 tied head,
bit1 interleaved RoPE), u16 nEmbd, u8 nLayer, u8 nHead, u16 ctxLen,
u16 vocabSize, u32 paramCount, u32 crc32(payload), u32 payloadBytes, u32
reserved. Payload order: `wte`, then per layer `ln1, attn.qkv, attn.proj,
ln2, ffn.w1, ffn.w3, ffn.w2`, then `norm_f`. The fp16/CRC32 codecs are
imported from `lib/llm/artifact.ts` — one codec, two containers. Why not
JLLM v1: the lab's `assertValidConfig` pins vocab 256 and its id path is
byte-typed end to end; the storyteller needs u16 ids.

**Tokenizer** (`lib/storyteller/tokenizer.ts`): a runtime port of the shipped
`tokenizer.json` (fetched and parsed in the worker — Python and TS consume
identical bytes). GPT-2 pre-tokenizer regex (JS `/gu` — nothing JS lacks),
bytes_to_unicode alphabet (keyed BY BYTE VALUE — indexing by list position is
the classic pitfall), rank-based BPE merges, `[EOT]` literal pre-split
(added-token semantics; id 0), reverse-map decode via a streaming
`TextDecoder`. **The default decode SKIPS special tokens** — this tokenizers
version's behavior, and how `sample.py` decoded the training samples, which
is why generated stories concatenate with no separator. Both decode modes
are gated.

**Forward + generation** (`lib/storyteller/model.ts`): one incremental
`step()` path processes a token at `seqLen`, appends its ROPED K (and V) to
per-layer caches, and returns next-token logits — prefill, generation, and
the gate share identical arithmetic by construction. The KV cache is
load-bearing: window recompute per token would cost ~3.5 GFLOP (≈1–2 s/token
in JS); the cache brings that to tens of ms. Past the first window,
generation rebuilds the cache from the last ctxLen ids — model.py's
sliding-window semantics, faithful to the trained generator. `generateStoryteller`
is async with an injectable `yieldNow` so the worker's `cancelGenerate` lands
between tokens; the gate and recorder omit it, and the rng stream never
depends on when we yield, so worker/gate/recorder produce identical ids.

**Worker/client seam**: `workers/storyteller.worker.ts` streams decoded TEXT
chunks (the worker owns the 594 KB tokenizer; the lab streams ids because
its client owns the byte tokenizer). The client
(`components/storyteller/storytellerClient.ts`) mirrors `llmClient.ts` —
serialized dispatch queue, single pending, cancel bypass, fire-and-forget
preload (voice pattern, Data Saver respected, triggered on first prompt
interaction). The page never breaks: load failures show a human sentence and
a retry while the static training story still renders.

## 3. Gate procedure and numbers

`npm run verify:storyteller-model` — 61 checks, exit 1 on any failure:

1. Tokenizer encode exact for 10 cases (contractions, CJK, emoji, NBSP,
   multi-space, the literal `[EOT]`, empty) + both decode modes.
2. Container: byte size (13,834,784), header config, crc32, and human-sentence
   rejection of bad magic / bad version / truncation / flipped payload byte /
   bad paramCount.
3. fp16 spot bit-patterns → exact f32 (pins the shared codec).
4. RoPE cos/sin tables at tolerance (abs 1e-5 OR rel 1e-3, 5-significant-digit
   fixtures — the voice/lab precedent).
5. Forward parity: first-64 + top-32 logits at tolerance, exact argmax, and
   exact 4-token greedy continuations for 3 prompts.
6. Param count 6,917,376 end to end.
7. Seeded-generation regression vs `fixtures/storyteller_expectations.json`
   (skip-when-absent, FAIL-when-present-but-unrecorded) — recorded FROM the
   shipped fp16 container via the same TS generate (TS-to-TS bit-exact;
   never the fp32 master: fp16 quantization changes generations — the chess
   lesson, twice over).
8. `trainingData.ts` matches `training_log.json` (41 eval points + 16
   samples — the generated module can't drift from the real run).

Pipeline: `export.py` (self-check: dequantized container logits within
0.004 of the fp32 master; greedy paths match token-for-token) →
`make_fixtures.py` (numpy mirror, never torch) → gate → `record_expectations.ts`
→ gate. All in `training/storyteller/`; runs on James's machine, never on
Vercel; the ckpt is read in place, never committed.

## 4. Fallback ladder

- No JS / pre-hydration: the static explainer card + the full training story
  (loss curve + scrubber) are server-rendered.
- Model or tokenizer fetch fails: human sentence + Retry; the page and the
  training story remain fully usable.
- Data Saver: no preload — the download waits for an explicit Generate.
- The lab's fallbacks (tf.js, ORT training, WebGPU) don't apply: no training
  happens in the browser here, and inference is hand-written TS by design.

## 5. Open concerns (for James)

- **The training repo is public**: https://github.com/jimbuido08/llm-from-scratch
  (created + pushed 2026-09-24 via gh; note gh's Go TLS needs the combined
  Avast CA bundle — `SSL_CERT_FILE=certs/ca-bundle.pem` — on this machine).
- The 8-node ring at θ = i·45° puts four nodes exactly on the axes (about
  already sat at 0° in the 7-node layout). A 22.5° offset is a one-line
  variant if the ring feels too aligned.
- No KV-cache re-rope optimization past the window: tokens beyond the first
  256 pay a full-window rebuild each (model.py-faithful). Typical stories
  (≤ 250 tokens) never hit it; maxTokens 400 can.
- `featured: true` sorts the storyteller first on `/ai-ml` — intended.