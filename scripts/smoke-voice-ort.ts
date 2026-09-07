/**
 * Milestone A feasibility gate — run the five voice ONNX graphs under the
 * ORT-web wasm backend (the same backend the browser uses, numThreads = 1)
 * with synthetic inputs, and print per-stage timings against the Milestone A
 * thresholds. Numbers are recorded in docs/notes/voice-cloning-architecture.md.
 *
 * Expects the fp32 exports under training/voice/export/ (see
 * training/voice/README.md). Synthetic inputs measure load + speed + shapes
 * only — numeric parity is Milestone B's fixture work. Input shapes mirror the
 * export contract in that doc (§2).
 *
 * Usage: npm run smoke:voice
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import * as ort from "onnxruntime-web/wasm";

ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const EXPORT_DIR = resolve("training/voice/export");

const TEXT_LEN = 50; // dummy text length (contract: dynamic T, cap 200)
const MEL_FRAMES = 32; // dummy mel length for the upsample probe

/** Milestone A thresholds (docs/notes/voice-cloning-architecture.md §3). */
const ENCODER_PARTIALS_FOR_4S = 7; // 160-frame partials @ 80-frame step
const FRAMES_FOR_10_WORDS = 640; // ~4 s of speech at 80 fps

function tensor(
  data: Float32Array | BigInt64Array,
  dims: number[],
): ort.Tensor {
  return new ort.Tensor(
    data instanceof BigInt64Array ? "int64" : "float32",
    data,
    dims,
  );
}

function zeros(dims: number[]): ort.Tensor {
  return tensor(new Float32Array(dims.reduce((a, b) => a * b, 1)), dims);
}

async function load(name: string): Promise<ort.InferenceSession> {
  const bytes = readFileSync(join(EXPORT_DIR, name));
  return ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ["wasm"],
  });
}

async function timeRuns(
  session: ort.InferenceSession,
  input: Record<string, ort.Tensor>,
  runs: number,
): Promise<number> {
  await session.run(input); // warm-up (wasm init, binding)
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    await session.run(input);
  }
  return (performance.now() - start) / runs;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`;
}

function verdict(label: string, ok: boolean): string {
  return `${ok ? "PASS" : "FAIL"}  (${label})`;
}

async function main(): Promise<void> {
  console.log(`voice smoke — ${EXPORT_DIR} (ORT wasm, numThreads=1)\n`);
  const failures: string[] = [];

  // 1. Encoder: [1, 40, 160] -> [1, 256]. Threshold: < 1 s for ~7 partials.
  try {
    const session = await load("voice-encoder.onnx");
    const mel = tensor(new Float32Array(40 * 160), [1, 40, 160]);
    const perPartial = await timeRuns(session, { mel_partial: mel }, 8);
    const per4s = perPartial * ENCODER_PARTIALS_FOR_4S;
    const ok = per4s < 1000;
    console.log(
      `encoder: ${fmt(perPartial)}/partial -> 4 s audio (~7 partials): ${fmt(per4s)}  ${verdict("< 1 s", ok)}`,
    );
    if (!ok) failures.push("encoder");
  } catch (err) {
    console.error(`encoder: FAILED — ${String(err)}`);
    failures.push("encoder");
  }

  // 2. Synth encode: text [1, T] int64 + spk [1, 256] -> enc_seq, enc_seq_proj.
  try {
    const session = await load("voice-synth-encode.onnx");
    const input: Record<string, ort.Tensor> = {
      text: tensor(new BigInt64Array(TEXT_LEN), [1, TEXT_LEN]),
      spk_embed: zeros([1, 256]),
    };
    const ms = await timeRuns(session, input, 3);
    const out = await session.run(input);
    const ok = ms < 1500;
    console.log(
      `synth encode (T=${TEXT_LEN}): ${fmt(ms)}, enc_seq ${JSON.stringify(out.enc_seq.dims)}  ${verdict("< 1.5 s", ok)}`,
    );
    if (!ok) failures.push("synth-encode");
  } catch (err) {
    console.error(`synth encode: FAILED — ${String(err)}`);
    failures.push("synth-encode");
  }

  // 3. Synth step: per-step ms -> extrapolate ~10 words (~640 mel frames).
  try {
    const session = await load("voice-synth-step.onnx");
    const input: Record<string, ort.Tensor> = {
      enc_seq: zeros([1, TEXT_LEN, 512]),
      enc_seq_proj: zeros([1, TEXT_LEN, 128]),
      chars: tensor(new BigInt64Array(TEXT_LEN), [1, TEXT_LEN]),
      prenet_in: zeros([1, 80]),
      attn_h: zeros([1, 128]),
      rnn1_h: zeros([1, 1024]),
      rnn2_h: zeros([1, 1024]),
      rnn1_c: zeros([1, 1024]),
      rnn2_c: zeros([1, 1024]),
      context: zeros([1, 512]),
      cumulative: zeros([1, TEXT_LEN]),
    };
    // Feed the next_* outputs back in as the next step's state.
    await session.run(input);
    const start = performance.now();
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const out = await session.run(input);
      for (const name of [
        "attn_h",
        "rnn1_h",
        "rnn2_h",
        "rnn1_c",
        "rnn2_c",
        "context",
        "cumulative",
      ]) {
        const next = out[`next_${name}`];
        if (next) input[name] = next;
      }
    }
    const perStep = (performance.now() - start) / steps;
    const words10 = perStep * FRAMES_FOR_10_WORDS;
    const ok = words10 < 8000;
    console.log(
      `synth step: ${fmt(perStep)}/step -> ~10 words (~640 steps): ${fmt(words10)}  ${verdict("< 8 s", ok)}`,
    );
    if (!ok) failures.push("synth-step");
  } catch (err) {
    console.error(`synth step: FAILED — ${String(err)}`);
    failures.push("synth-step");
  }

  // 4. Vocoder upsample: mel [1, 80, T] -> conditioning pair (shape check).
  try {
    const session = await load("voice-voc-upsample.onnx");
    const input = { mel: zeros([1, 80, MEL_FRAMES]) };
    const ms = await timeRuns(session, input, 3);
    const out = await session.run(input);
    const values = Object.values(out);
    console.log(
      `voc upsample: mel [1,80,${MEL_FRAMES}] -> ${JSON.stringify(values[0].dims)} / ${JSON.stringify(values[1].dims)} in ${fmt(ms)}`,
    );
  } catch (err) {
    console.error(`voc upsample: FAILED — ${String(err)}`);
    failures.push("voc-upsample");
  }

  // 5. Vocoder step (diagnostic only, not the shipping form): per-sample run
  // overhead dominates here — the chunk graph below is what ships.
  try {
    const session = await load("voice-voc-step.onnx");
    const input: Record<string, ort.Tensor> = {
      x_prev: zeros([1, 1]),
      m_t: zeros([1, 80]),
      a1: zeros([1, 32]),
      a2: zeros([1, 32]),
      a3: zeros([1, 32]),
      a4: zeros([1, 32]),
      h1: zeros([1, 512]),
      h2: zeros([1, 512]),
    };
    const perSample = await timeRuns(session, input, 64);
    const perSecond = perSample * 16000;
    console.log(
      `voc step (baseline): ${fmt(perSample)}/sample -> 4 s: ${fmt(perSecond * 4)}  (diagnostic, not gated)`,
    );
  } catch (err) {
    console.error(`voc step (baseline): FAILED — ${String(err)}`);
    failures.push("voc-step");
  }

  // 5b. Vocoder chunk (shippable form): one mel frame (200 samples) per run,
  // sampling in-graph. Threshold: 4 s of audio < 20 s.
  try {
    const session = await load("voice-voc-chunk.onnx");
    const input: Record<string, ort.Tensor> = {
      x_prev: zeros([1, 1]),
      mels: zeros([200, 80]),
      aux: zeros([200, 128]),
      h1: zeros([1, 512]),
      h2: zeros([1, 512]),
      u: tensor(
        Float32Array.from({ length: 200 * 512 }, () => 0.5),
        [200, 512],
      ),
    };
    const perFrame = await timeRuns(session, input, 8);
    const perSecond = perFrame * 80; // 80 mel frames per second of audio
    const ok = perSecond * 4 < 20000;
    const out = await session.run(input);
    console.log(
      `voc chunk: ${fmt(perFrame)}/frame (200 samples) -> 1 s: ${fmt(perSecond)} | 2 s: ${fmt(perSecond * 2)} | 4 s: ${fmt(perSecond * 4)}; samples ${JSON.stringify(out.samples.dims)}  ${verdict("< 20 s @ 4 s", ok)}`,
    );
    if (!ok) failures.push("voc-chunk");
  } catch (err) {
    console.error(`voc chunk: FAILED — ${String(err)}`);
    failures.push("voc-chunk");
  }

  // 5c. int8 voc step (size candidate): same timing methodology.
  try {
    const session = await load("voice-voc-step-int8.onnx");
    const input: Record<string, ort.Tensor> = {
      x_prev: zeros([1, 1]),
      m_t: zeros([1, 80]),
      a1: zeros([1, 32]),
      a2: zeros([1, 32]),
      a3: zeros([1, 32]),
      a4: zeros([1, 32]),
      h1: zeros([1, 512]),
      h2: zeros([1, 512]),
    };
    const perSample = await timeRuns(session, input, 64);
    const perSecond = perSample * 16000;
    console.log(
      `voc step int8: ${fmt(perSample)}/sample -> 1 s: ${fmt(perSecond)} | 4 s: ${fmt(perSecond * 4)}  (candidate, no gate)`,
    );
  } catch (err) {
    console.error(`voc step int8: FAILED — ${String(err)}`);
    failures.push("voc-step-int8");
  }

  console.log("");
  if (failures.length > 0) {
    console.error(
      `GATE: FAIL (${failures.join(", ")}) — record numbers in docs/notes/voice-cloning-architecture.md`,
    );
    process.exitCode = 1;
  } else {
    console.log("GATE: all stages pass on tsx numbers — browser smoke next");
  }
}

void main();
