/**
 * Main-thread client for the storyteller worker — the llmClient pattern:
 * a lazily constructed module worker, a serialized dispatch queue (one
 * request in flight; failures don't kill the chain), a single pending
 * request, human-sentence error routing, and a cancel that bypasses the
 * queue by design. fetch + transfer: the worker never touches the network.
 */

import {
  fetchStorytellerModel,
  fetchStorytellerTokenizer,
} from "@/lib/storyteller/loader";
import type {
  StorytellerRequest,
  StorytellerResponse,
} from "../../workers/storyteller.worker";

type ModelLoadedMsg = Extract<StorytellerResponse, { type: "modelLoaded" }>;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  onChunk?: (text: string, tokens: number, done: boolean) => void;
}

export interface GenerateSummary {
  tokens: number;
  cancelled: boolean;
}

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending: Pending | null = null;
let loadPromise: Promise<ModelLoadedMsg> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("../../workers/storyteller.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.onmessage = (ev: MessageEvent<StorytellerResponse>) =>
      route(ev.data);
    worker.onerror = (ev) => {
      pending?.reject(
        new Error(`The storyteller worker crashed: ${ev.message}`),
      );
      pending = null;
    };
  }
  return worker;
}

function route(msg: StorytellerResponse): void {
  switch (msg.type) {
    case "ready":
      return; // fire-and-forget worker ack
    case "genChunk": {
      pending?.onChunk?.(msg.text, msg.tokens, msg.done);
      if (msg.done) {
        const p = pending;
        pending = null;
        p?.resolve({ tokens: msg.tokens, cancelled: false });
      }
      return;
    }
    case "genCancelled": {
      const p = pending;
      pending = null;
      p?.resolve({ tokens: msg.tokens, cancelled: true });
      return;
    }
    case "modelLoaded": {
      const p = pending;
      pending = null;
      p?.resolve(msg);
      return;
    }
    case "error": {
      const p = pending;
      pending = null;
      p?.reject(new Error(msg.message));
      return;
    }
  }
}

/** Serialize a request behind any in-flight one (the worker is a single pipeline). */
function dispatch<T>(
  send: (w: Worker) => void,
  onChunk?: Pending["onChunk"],
): Promise<T> {
  const run = new Promise<T>((resolve, reject) => {
    pending = { resolve: resolve as (v: unknown) => void, reject, onChunk };
    send(getWorker());
  });
  queue = queue.then(
    () => run,
    () => run,
  );
  return run;
}

export function requestInit(): Promise<void> {
  return dispatch((w) =>
    w.postMessage({ type: "init" } satisfies StorytellerRequest),
  );
}

/** Fetch both artifacts and load them into the worker. Cached: one load per page. */
function loadModel(): Promise<ModelLoadedMsg> {
  const run = dispatch<ModelLoadedMsg>(async (w) => {
    const [model, tokenizer] = await Promise.all([
      fetchStorytellerModel(),
      fetchStorytellerTokenizer(),
    ]);
    // Fetch always hands back ArrayBuffer-backed views; the slices are ours to transfer.
    const modelCopy = model.buffer.slice(
      model.byteOffset,
      model.byteOffset + model.byteLength,
    ) as ArrayBuffer;
    const tokenizerCopy = tokenizer.buffer.slice(
      tokenizer.byteOffset,
      tokenizer.byteOffset + tokenizer.byteLength,
    ) as ArrayBuffer;
    w.postMessage(
      {
        type: "loadModel",
        modelBytes: modelCopy,
        tokenizerBytes: tokenizerCopy,
      } satisfies StorytellerRequest,
      [modelCopy, tokenizerCopy],
    );
  });
  return run;
}

export function ensureStorytellerLoaded(): Promise<ModelLoadedMsg> {
  loadPromise ??= loadModel().catch((err) => {
    loadPromise = null; // a failed load must be retryable
    throw err;
  });
  return loadPromise;
}

export function requestGenerate(
  prompt: string,
  maxTokens: number,
  temperature: number,
  seed: number,
  onChunk: (text: string, tokens: number, done: boolean) => void,
): Promise<GenerateSummary> {
  return dispatch<GenerateSummary>(
    (w) =>
      w.postMessage({
        type: "generate",
        prompt,
        maxTokens,
        temperature,
        seed,
      } satisfies StorytellerRequest),
    onChunk,
  );
}

/** Bypasses the queue — a cancel must land even while a generation is in flight. */
export function requestCancelGenerate(): void {
  getWorker().postMessage({
    type: "cancelGenerate",
  } satisfies StorytellerRequest);
}

/** Fire-and-forget warm-up (the voice preload pattern: errors swallowed; the real path retries). */
export function requestPreload(): void {
  ensureStorytellerLoaded().catch(() => undefined);
}
