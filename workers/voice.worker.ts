/**
 * The /voice production worker — owns the ONNX engine so heavy wasm inference
 * never blocks the UI thread, and so audio/recording data stays in one
 * non-main-thread process (device-only consent guardrail: nothing here talks
 * to the network; only the /api/voice/claim reward call ever leaves, from the
 * page, with an empty body — Milestone E).
 *
 * Message protocol (all buffers transferred, never copied):
 *   in:  { type: "embed", pcm: Float32Array }
 *        { type: "synthesize", text: string, embed: Float32Array, seed: number }
 *   out: { type: "stage", stage, current?, total? }
 *        { type: "embedding", embed: Float32Array }
 *        { type: "audio", samples: Float32Array, sampleRate: 16000 }
 *        { type: "error", message: string }
 */
import { createVoiceEngine, type EngineStage } from "../lib/voice/engine";

export interface EmbedRequest {
  type: "embed";
  pcm: Float32Array;
}
export interface SynthesizeRequest {
  type: "synthesize";
  text: string;
  embed: Float32Array;
  seed: number;
}
export type VoiceRequest = EmbedRequest | SynthesizeRequest;

export interface StageMessage {
  type: "stage";
  stage: EngineStage;
  current?: number;
  total?: number;
}
export interface EmbeddingMessage {
  type: "embedding";
  embed: Float32Array;
}
export interface AudioMessage {
  type: "audio";
  samples: Float32Array;
  sampleRate: number;
}
export interface ErrorMessage {
  type: "error";
  message: string;
}
export type VoiceResponse = StageMessage | EmbeddingMessage | AudioMessage | ErrorMessage;

const workerScope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const post = (message: VoiceResponse, transfer: Transferable[] = []): void => {
  workerScope.postMessage(message, transfer);
};

const engine = createVoiceEngine();
const onProgress: Parameters<typeof engine.embed>[1] = (progress) => {
  post({
    type: "stage",
    stage: progress.stage,
    current: progress.current,
    total: progress.total,
  });
};

self.onmessage = async (event: MessageEvent<VoiceRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case "embed": {
        const embed = await engine.embed(request.pcm, onProgress);
        post({ type: "embedding", embed }, [embed.buffer]);
        break;
      }
      case "synthesize": {
        const samples = await engine.synthesize(
          request.text,
          request.embed,
          request.seed,
          onProgress,
        );
        const owned = new Float32Array(samples); // subarray → own buffer to transfer
        post(
          { type: "audio", samples: owned, sampleRate: 16000 },
          [owned.buffer],
        );
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};