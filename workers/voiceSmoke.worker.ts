/**
 * Milestone A browser smoke — the same stages as scripts/smoke-voice-ort.ts,
 * inside a real Web Worker (the deployment shape Milestone C will use).
 * Temporary: removed or folded into workers/voice.worker.ts once the gate
 * passes and /voice is built.
 *
 * Synthetic inputs measure load + speed + shapes in real Chrome/Safari —
 * numeric parity is Milestone B's fixture work. Thresholds mirror §3 of
 * docs/notes/voice-cloning-architecture.md.
 */
import * as ort from "onnxruntime-web/wasm";

ort.env.wasm.wasmPaths = "/models/ort/";
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const MODEL_BASE = "/models/voice/";

export interface SmokeStage {
  id: string;
  label: string;
  status: "running" | "pass" | "fail";
  ms?: number;
  detail?: string;
}

type Post = (
  message: SmokeStage | { type: "done"; failures: string[] },
) => void;

const post: Post = (message) => self.postMessage(message);

const TEXT_LEN = 50;
const MEL_FRAMES = 32;
const ENCODER_PARTIALS_FOR_4S = 7;
const FRAMES_FOR_10_WORDS = 640;
const VOC_TOTAL_SCALE = 200; // upsample factors (5, 5, 8) product

function zeros(dims: number[]): ort.Tensor {
  const size = dims.reduce((a, b) => a * b, 1);
  return new ort.Tensor("float32", new Float32Array(size), dims);
}

function int64(n: number, dims: number[]): ort.Tensor {
  return new ort.Tensor("int64", new BigInt64Array(n), dims);
}

async function loadModel(name: string): Promise<ort.InferenceSession> {
  const response = await fetch(`${MODEL_BASE}${name}`);
  if (!response.ok) {
    throw new Error(`fetch ${name}: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ["wasm"],
  });
}

/** Load + warm up, then return the mean per-run ms over `runs` timed runs. */
async function meanRunMs(
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

async function stage(
  id: string,
  label: string,
  fn: () => Promise<{ ms: number | null; detail: string; ok: boolean }>,
): Promise<boolean> {
  post({ id, label, status: "running" });
  try {
    const { ms, detail, ok } = await fn();
    post({ id, label, status: ok ? "pass" : "fail", ms: ms ?? undefined, detail });
    return ok;
  } catch (err) {
    post({ id, label, status: "fail", detail: String(err) });
    return false;
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const run = async (
    id: string,
    label: string,
    thresholdLabel: string,
    name: string,
    msToOk: (ms: number) => boolean,
    buildInput: () => Record<string, ort.Tensor>,
    postRun?: (
      session: ort.InferenceSession,
      input: Record<string, ort.Tensor>,
    ) => Promise<string>,
    runs = 8,
  ): Promise<boolean> =>
    stage(id, label, async () => {
      const session = await loadModel(name);
      const input = buildInput();
      const ms = await meanRunMs(session, input, runs);
      let detail = `${ms.toFixed(1)} ms/run vs ${thresholdLabel}`;
      if (postRun) {
        detail += `; ${await postRun(session, input)}`;
      }
      return { ms, detail, ok: msToOk(ms) };
    });

  if (
    !(await run(
      "encoder",
      "encoder [1,40,160]",
      "< 143 ms (1 s / 7 partials)",
      "voice-encoder.onnx",
      (ms) => ms * ENCODER_PARTIALS_FOR_4S < 1000,
      () => ({ mel_partial: zeros([1, 40, 160]) }),
    ))
  ) {
    failures.push("encoder");
  }

  if (
    !(await run(
      "synth-encode",
      "synth encode T=50",
      "< 1.5 s",
      "voice-synth-encode.onnx",
      (ms) => ms < 1500,
      () => ({ text: int64(TEXT_LEN, [1, TEXT_LEN]), spk_embed: zeros([1, 256]) }),
      async (session, input) =>
        `enc_seq ${JSON.stringify(Object.values(await session.run(input))[0].dims)}`,
    ))
  ) {
    failures.push("synth-encode");
  }

  // Synth step: rotate next_* outputs back in, measure per-step ms.
  if (
    !(await stage("synth-step", "synth step ×64", async () => {
      const session = await loadModel("voice-synth-step.onnx");
      const input: Record<string, ort.Tensor> = {
        enc_seq: zeros([1, TEXT_LEN, 512]),
        enc_seq_proj: zeros([1, TEXT_LEN, 128]),
        chars: int64(TEXT_LEN, [1, TEXT_LEN]),
        prenet_in: zeros([1, 80]),
        attn_h: zeros([1, 128]),
        rnn1_h: zeros([1, 1024]),
        rnn2_h: zeros([1, 1024]),
        rnn1_c: zeros([1, 1024]),
        rnn2_c: zeros([1, 1024]),
        context: zeros([1, 512]),
        cumulative: zeros([1, TEXT_LEN]),
      };
      await session.run(input);
      const steps = 64;
      const start = performance.now();
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
      return {
        ms: perStep,
        detail: `${perStep.toFixed(2)} ms/step -> ~10 words: ${(words10 / 1000).toFixed(2)} s (< 8 s)`,
        ok: words10 < 8000,
      };
    }))
  ) {
    failures.push("synth-step");
  }

  if (
    !(await run(
      "voc-upsample",
      "voc upsample [1,80,32]",
      "n/a (shape check)",
      "voice-voc-upsample.onnx",
      () => true,
      () => ({ mel: zeros([1, 80, MEL_FRAMES]) }),
      async (session, input) => {
        const out = await session.run(input);
        const values = Object.values(out);
        return `pair ${JSON.stringify(values[0].dims)} / ${JSON.stringify(values[1].dims)}`;
      },
    ))
  ) {
    failures.push("voc-upsample");
  }

  // Vocoder chunk — the shipping form: one mel frame per run.
  if (
    !(await run(
      "voc-chunk",
      "voc chunk (1 frame = 200 samples)",
      "< 250 ms/frame (20 s @ 4 s)",
      "voice-voc-chunk.onnx",
      (ms) => ms * 80 * 4 < 20000,
      () => ({
        x_prev: zeros([1, 1]),
        // Per-sample conditioning rows — the frame's slice of the upsampled pair.
        mels: zeros([VOC_TOTAL_SCALE, 80]),
        aux: zeros([VOC_TOTAL_SCALE, 128]),
        h1: zeros([1, 512]),
        h2: zeros([1, 512]),
        u: new ort.Tensor(
          "float32",
          Float32Array.from({ length: VOC_TOTAL_SCALE }, () => 0.5),
          [VOC_TOTAL_SCALE],
        ),
      }),
      async (session, input) => {
        const out = await session.run(input);
        return `samples ${JSON.stringify(out.samples.dims)}`;
      },
    ))
  ) {
    failures.push("voc-chunk");
  }

  post({ type: "done", failures });
}

void main();