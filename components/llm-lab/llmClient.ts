"use client";

/**
 * Main-thread client for the /llm-lab worker — promise plumbing over the
 * message protocol in workers/llm.worker.ts, copied from the voiceClient
 * pattern: requests serialize (the worker is a single training pipeline),
 * progress messages broadcast to listeners, and errors reject the pending
 * request. Two deviations from voice, both because we own the compute loop:
 * cancelTrain BYPASSES the queue (the worker honours it between optimizer
 * steps), and generation streams token chunks to the active request's
 * listener until genDone.
 */
import type {
  LlmRequest,
  LlmResponse,
  ProgressMessage,
} from "../../workers/llm.worker";
import type { PresetKey } from "../../lib/llm/config";

export type ProgressListener = (progress: ProgressMessage) => void;
export type ChunkListener = (ids: Uint8Array, done: boolean) => void;

interface Pending {
  resolve: (value: LlmResponse) => void;
  reject: (reason: Error) => void;
  /** Non-null while a generate request is in flight. */
  onChunk: ChunkListener | null;
}

let worker: Worker | null = null;
let pending: Pending | null = null;
let queue: Promise<unknown> = Promise.resolve();

const progressListeners = new Set<ProgressListener>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/llm.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<LlmResponse>) => {
    const message = event.data;
    if (message.type === "progress") {
      progressListeners.forEach((fn) => fn(message));
      return;
    }
    if (message.type === "genTokens" && pending?.onChunk) {
      const { onChunk } = pending;
      if (!message.done) {
        onChunk(message.ids, false);
        return;
      }
      pending.onChunk = null;
      onChunk(message.ids, true);
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
    current?.reject(new Error(`llm worker crashed: ${event.message}`));
  };
  return worker;
}

function addProgressListener(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

/** Serialized dispatch — each request waits for the previous one to settle. */
function dispatch(
  start: (w: Worker) => void,
  onChunk: ChunkListener | null = null,
): Promise<LlmResponse> {
  const run = queue.then(
    () =>
      new Promise<LlmResponse>((resolve, reject) => {
        const w = getWorker();
        pending = { resolve, reject, onChunk };
        start(w);
      }),
  );
  queue = run.catch(() => undefined); // keep the chain alive after failures
  return run;
}

/** Warm the worker and measure device matmul throughput (~100 ms). */
export function requestInit(): Promise<number> {
  return dispatch((w) => {
    const request: LlmRequest = { type: "init" };
    w.postMessage(request);
  }).then((response) => {
    if (response.type !== "ready")
      throw new Error("unexpected worker response for init");
    return response.measuredGflops;
  });
}

export interface TrainHandle {
  promise: Promise<TrainOutcome>;
  cancelProgress: () => void;
}

export type TrainOutcome =
  | { kind: "done"; finalLoss: number; steps: number; elapsedMs: number }
  | { kind: "cancelled"; atStep: number; lossEma: number };

/** Train on corpus bytes. Transfers a copy (the caller keeps its own). */
export function requestTrain(
  corpus: Uint8Array,
  preset: PresetKey,
  steps: number,
  seed: number,
  onProgress?: ProgressListener,
): TrainHandle {
  const cancelProgress = onProgress
    ? addProgressListener(onProgress)
    : () => undefined;
  const copy = new Uint8Array(corpus); // transfer invalidates; keep caller's copy
  const promise = dispatch((w) => {
    const request: LlmRequest = {
      type: "train",
      corpus: copy,
      preset,
      steps,
      seed,
    };
    w.postMessage(request, [copy.buffer]);
  }).then((response): TrainOutcome => {
    cancelProgress();
    if (response.type === "trainDone")
      return {
        kind: "done",
        finalLoss: response.finalLoss,
        steps: response.steps,
        elapsedMs: response.elapsedMs,
      };
    if (response.type === "trainCancelled")
      return {
        kind: "cancelled",
        atStep: response.atStep,
        lossEma: response.lossEma,
      };
    throw new Error("unexpected worker response for train");
  });
  return { promise, cancelProgress };
}

/**
 * Ask the worker to stop after the current optimizer step. Bypasses the
 * request queue so it lands while a train is running; safe to call when idle.
 */
export function requestCancelTrain(): void {
  const w = getWorker();
  const request: LlmRequest = { type: "cancelTrain" };
  w.postMessage(request);
}

export interface GenerateHandle {
  promise: Promise<void>;
}

/** Stream generation from the current model — chunks arrive via onChunk. */
export function requestGenerate(
  promptIds: Uint8Array,
  maxTokens: number,
  temperature: number,
  seed: number,
  onChunk: ChunkListener,
): GenerateHandle {
  const copy = new Uint8Array(promptIds);
  const promise = dispatch((w) => {
    const request: LlmRequest = {
      type: "generate",
      promptIds: copy,
      maxTokens,
      temperature,
      seed,
    };
    w.postMessage(request, [copy.buffer]);
  }, onChunk).then((response) => {
    if (response.type !== "genTokens" || !response.done)
      throw new Error("unexpected worker response for generate");
  });
  return { promise };
}

export interface ArtifactLoadedInfo {
  params: number;
  dModel: number;
  nLayer: number;
  ctxLen: number;
  source: "upload" | "sample";
}

/** Load checkpoint bytes (sample download or visitor upload). */
export function requestLoadArtifact(
  bytes: Uint8Array,
  source: "upload" | "sample",
): Promise<ArtifactLoadedInfo> {
  const copy = bytes.slice().buffer; // transfer invalidates the original
  return dispatch((w) => {
    const request: LlmRequest = { type: "loadArtifact", bytes: copy, source };
    w.postMessage(request, [copy]);
  }).then((response) => {
    if (response.type !== "artifactLoaded")
      throw new Error("unexpected worker response for loadArtifact");
    return response;
  });
}

export interface ExportedArtifact {
  bytes: ArrayBuffer;
  suggestedName: string;
}

/** Serialise the current model as a downloadable JLLM v1 fp16 checkpoint. */
export function requestExportArtifact(): Promise<ExportedArtifact> {
  return dispatch((w) => {
    const request: LlmRequest = { type: "exportArtifact" };
    w.postMessage(request);
  }).then((response) => {
    if (response.type !== "artifact")
      throw new Error("unexpected worker response for exportArtifact");
    return { bytes: response.bytes, suggestedName: response.suggestedName };
  });
}
