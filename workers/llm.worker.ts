/**
 * The /llm-lab worker — owns the tiny-transformer trainer and the current
 * model so all float math stays off the UI thread. Everything is on-device:
 * the network is never touched here (the main thread fetches sample/upload
 * bytes and passes them in by transfer). Mirrors the voice-worker conventions:
 * buffers transferred never copied, a single pipeline (the main thread
 * serializes requests), errors are human sentences.
 *
 * Message protocol:
 *   in:  { type: "init" }
 *        { type: "train", corpus: Uint8Array, preset: PresetKey, steps: number, seed: number }
 *        { type: "cancelTrain" }                        (bypasses the queue)
 *        { type: "generate", promptIds, maxTokens, temperature, seed }
 *        { type: "loadArtifact", bytes: ArrayBuffer, source: "upload" | "sample" }
 *        { type: "exportArtifact" }
 *   out: { type: "ready", measuredGflops }
 *        { type: "progress", step, totalSteps, loss, lossEma, tokensPerSec, etaSeconds, sample? }
 *        { type: "trainDone", finalLoss, steps, elapsedMs }
 *        { type: "trainCancelled", atStep, lossEma }    (partial weights stay — generation works)
 *        { type: "genTokens", ids: Uint8Array, done: boolean }
 *        { type: "artifactLoaded", params, dModel, nLayer, ctxLen, source }
 *        { type: "artifact", bytes: ArrayBuffer, suggestedName }
 *        { type: "error", message }
 */
import { PRESETS, type PresetKey } from "../lib/llm/config";
import { decodeArtifact, encodeArtifact } from "../lib/llm/artifact";
import { matmulABt } from "../lib/llm/kernels";
import { createWorkspace, generate } from "../lib/llm/model";
import type { Model, Workspace } from "../lib/llm/model";
import { trainModel } from "../lib/llm/trainLoop";

export interface InitRequest {
  type: "init";
}
export interface TrainRequest {
  type: "train";
  corpus: Uint8Array;
  preset: PresetKey;
  steps: number;
  seed: number;
}
export interface CancelTrainRequest {
  type: "cancelTrain";
}
export interface GenerateRequest {
  type: "generate";
  promptIds: Uint8Array;
  maxTokens: number;
  temperature: number;
  seed: number;
}
export interface LoadArtifactRequest {
  type: "loadArtifact";
  bytes: ArrayBuffer;
  source: "upload" | "sample";
}
export interface ExportArtifactRequest {
  type: "exportArtifact";
}
export type LlmRequest =
  | InitRequest
  | TrainRequest
  | CancelTrainRequest
  | GenerateRequest
  | LoadArtifactRequest
  | ExportArtifactRequest;

export interface ReadyMessage {
  type: "ready";
  measuredGflops: number;
}
export interface ProgressMessage {
  type: "progress";
  step: number;
  totalSteps: number;
  loss: number;
  lossEma: number;
  tokensPerSec: number;
  etaSeconds: number;
  sample?: string;
}
export interface TrainDoneMessage {
  type: "trainDone";
  finalLoss: number;
  steps: number;
  elapsedMs: number;
}
export interface TrainCancelledMessage {
  type: "trainCancelled";
  atStep: number;
  lossEma: number;
}
export interface GenTokensMessage {
  type: "genTokens";
  ids: Uint8Array;
  done: boolean;
}
export interface ArtifactLoadedMessage {
  type: "artifactLoaded";
  params: number;
  dModel: number;
  nLayer: number;
  ctxLen: number;
  source: "upload" | "sample";
}
export interface ArtifactMessage {
  type: "artifact";
  bytes: ArrayBuffer;
  suggestedName: string;
}
export interface LlmErrorMessage {
  type: "error";
  message: string;
}
export type LlmResponse =
  | ReadyMessage
  | ProgressMessage
  | TrainDoneMessage
  | TrainCancelledMessage
  | GenTokensMessage
  | ArtifactLoadedMessage
  | ArtifactMessage
  | LlmErrorMessage;

const workerScope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const post = (message: LlmResponse, transfer: Transferable[] = []): void => {
  workerScope.postMessage(message, transfer);
};

// ---- module state (the worker is a single pipeline; the client serializes) --

let current: Model | null = null;
let genWs: Workspace | null = null;
let genWsKey = "";
let lastLossEma = NaN;
const cancelFlag = { cancelled: false };

function workspaceFor(model: Model): Workspace {
  const c = model.config;
  const key = `${c.dModel}x${c.nLayer}x${c.nHead}x${c.ctxLen}`;
  if (!genWs || genWsKey !== key) {
    genWs = createWorkspace(c, 1, c.ctxLen, false);
    genWsKey = key;
  }
  return genWs;
}

/** ~100 ms timed matmul at a representative shape → measured GFLOP/s. */
function calibrate(): number {
  const m = 96;
  const kk = 96;
  const n = 288;
  const a = new Float32Array(m * kk);
  const b = new Float32Array(n * kk);
  const out = new Float32Array(m * n);
  for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.37) * 0.5;
  for (let i = 0; i < b.length; i++) b[i] = Math.cos(i * 0.19) * 0.5;
  matmulABt(out, a, b, m, kk, n); // warm
  const t0 = performance.now();
  let iters = 0;
  while (performance.now() - t0 < 100) {
    matmulABt(out, a, b, m, kk, n);
    iters++;
  }
  const seconds = (performance.now() - t0) / 1000;
  return (2 * m * kk * n * iters) / seconds / 1e9;
}

async function handleTrain(msg: TrainRequest): Promise<void> {
  const preset = PRESETS[msg.preset];
  if (!preset) throw new Error(`unknown preset "${msg.preset}"`);
  cancelFlag.cancelled = false;
  const result = await trainModel(msg.corpus, preset, {
    steps: msg.steps,
    seed: msg.seed,
    isCancelled: () => cancelFlag.cancelled,
    onProgress: (p) => {
      lastLossEma = p.lossEma;
      const message: ProgressMessage = {
        type: "progress",
        step: p.step,
        totalSteps: p.totalSteps,
        loss: p.loss,
        lossEma: p.lossEma,
        tokensPerSec: p.tokensPerSec,
        etaSeconds: p.etaSeconds,
        sample: p.sample,
      };
      post(message);
    },
  });
  current = result.model; // cancelled runs keep partial weights by design
  if (result.cancelled) {
    post({
      type: "trainCancelled",
      atStep: result.steps,
      lossEma: lastLossEma,
    });
  } else {
    post({
      type: "trainDone",
      finalLoss: result.finalLoss,
      steps: result.steps,
      elapsedMs: result.elapsedMs,
    });
  }
}

function handleGenerate(msg: GenerateRequest): void {
  if (!current) throw new Error("Train a model or load one first.");
  generate(current, workspaceFor(current), msg.promptIds, {
    maxTokens: msg.maxTokens,
    temperature: msg.temperature,
    seed: msg.seed,
    onChunk: (chunk) => {
      const copy = new Uint8Array(chunk);
      post({ type: "genTokens", ids: copy, done: false }, [copy.buffer]);
    },
  });
  post({ type: "genTokens", ids: new Uint8Array(0), done: true });
}

function handleLoadArtifact(msg: LoadArtifactRequest): void {
  const model = decodeArtifact(new Uint8Array(msg.bytes));
  current = model;
  post({
    type: "artifactLoaded",
    params: model.weights.length,
    dModel: model.config.dModel,
    nLayer: model.config.nLayer,
    ctxLen: model.config.ctxLen,
    source: msg.source,
  });
}

function handleExportArtifact(): void {
  if (!current)
    throw new Error(
      "There's no model to download yet — train or load one first.",
    );
  const bytes = encodeArtifact(current, 1); // fp16 — half the download
  const c = current.config;
  post(
    {
      type: "artifact",
      bytes,
      suggestedName: `llm-lab-${c.dModel}d-${c.nLayer}l.bin`,
    },
    [bytes],
  );
}

self.onmessage = (event: MessageEvent<LlmRequest>) => {
  const msg = event.data;
  // Cancel bypasses every queue — it's honoured between optimizer steps.
  if (msg.type === "cancelTrain") {
    cancelFlag.cancelled = true;
    return;
  }
  void (async () => {
    try {
      switch (msg.type) {
        case "init":
          post({ type: "ready", measuredGflops: calibrate() });
          break;
        case "train":
          await handleTrain(msg);
          break;
        case "generate":
          handleGenerate(msg);
          break;
        case "loadArtifact":
          handleLoadArtifact(msg);
          break;
        case "exportArtifact":
          handleExportArtifact();
          break;
      }
    } catch (err) {
      post({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong in the trainer.",
      });
    }
  })();
};
