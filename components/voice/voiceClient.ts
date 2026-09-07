"use client";

/**
 * Main-thread client for the /voice worker — promise plumbing over the
 * message protocol in workers/voice.worker.ts. Requests are serialized (the
 * worker is a single inference pipeline), progress callbacks forward the
 * worker's stage messages, and errors reject the pending request.
 */
import type {
  VoiceRequest,
  VoiceResponse,
} from "../../workers/voice.worker";
import type { EngineStage, EngineProgress } from "../../lib/voice/engine";

type StageListener = (progress: EngineProgress) => void;

interface Pending {
  resolve: (value: VoiceResponse) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let pending: Pending | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("../../workers/voice.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (event: MessageEvent<VoiceResponse>) => {
    const message = event.data;
    if (message.type === "stage") {
      stageListeners.forEach((fn) => fn(message));
      return;
    }
    const current = pending;
    pending = null;
    if (!current) return;
    if (message.type === "error") {
      current.reject(new Error(message.message));
    } else {
      current.resolve(message);
    }
  };
  worker.onerror = (event) => {
    const current = pending;
    pending = null;
    const error = new Error(`voice worker crashed: ${event.message}`);
    current?.reject(error);
    stageListeners.forEach((fn) =>
      fn({ stage: "loading" }),
    );
  };
  return worker;
}

const stageListeners = new Set<StageListener>();

function addStageListener(fn: StageListener): () => void {
  stageListeners.add(fn);
  return () => stageListeners.delete(fn);
}

/** Serialized dispatch — each request waits for the previous one to settle. */
function dispatch(
  start: (w: Worker) => void,
): Promise<VoiceResponse> {
  const run = queue.then(
    () =>
      new Promise<VoiceResponse>((resolve, reject) => {
        const w = getWorker();
        pending = { resolve, reject };
        start(w);
      }),
  );
  queue = run.catch(() => undefined); // keep the chain alive after failures
  return run;
}

export interface EmbedHandle<T> {
  promise: Promise<T>;
  cancelStage: () => void;
}

/** Speaker embedding from 16 kHz mono PCM. Transfers a copy of `pcm`. */
export function requestEmbed(
  pcm: Float32Array,
  onStage?: StageListener,
): EmbedHandle<Float32Array> {
  const cancelStage = onStage ? addStageListener(onStage) : () => undefined;
  const copy = new Float32Array(pcm); // transfer invalidates; keep caller's copy
  const promise = dispatch((w) => {
    const request: VoiceRequest = { type: "embed", pcm: copy };
    w.postMessage(request, [copy.buffer]);
  }).then((response) => {
    cancelStage();
    if (response.type !== "embedding") {
      throw new Error("unexpected worker response for embed");
    }
    return response.embed;
  });
  return { promise, cancelStage };
}

/** Fire-and-forget warm-up of the synthesis graphs (engine.preload). Runs
 * through the serialized queue, so a Synthesize click made mid-preload simply
 * waits — and then finds the sessions already built. Errors are swallowed:
 * synthesis is the path that reports download problems. */
export function requestPreload(): void {
  const promise = dispatch((w) => {
    const request: VoiceRequest = { type: "preload" };
    w.postMessage(request);
  }).then((response) => {
    if (response.type !== "preloaded") {
      throw new Error("unexpected worker response for preload");
    }
  });
  promise.catch(() => undefined); // preload outcome is not user-facing
}

export interface SynthesisResult {
  samples: Float32Array;
  sampleRate: number;
}

/** Text → audio. The embed must already be computed (requestEmbed). The
 * embed is copied before transfer so the caller can re-synthesize with it. */
export function requestSynthesize(
  text: string,
  embed: Float32Array,
  seed: number,
  onStage?: StageListener,
): EmbedHandle<SynthesisResult> {
  const cancelStage = onStage ? addStageListener(onStage) : () => undefined;
  const embedCopy = new Float32Array(embed);
  const promise = dispatch((w) => {
    const request: VoiceRequest = { type: "synthesize", text, embed: embedCopy, seed };
    w.postMessage(request, [embedCopy.buffer]);
  }).then((response) => {
    cancelStage();
    if (response.type !== "audio") {
      throw new Error("unexpected worker response for synthesize");
    }
    return { samples: response.samples, sampleRate: response.sampleRate } as SynthesisResult;
  });
  return { promise, cancelStage };
}

export type { EngineStage };