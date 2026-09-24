/**
 * The storyteller worker — owns the model and the tokenizer; runs generation;
 * streams decoded TEXT chunks (the lab streams ids because its client owns the
 * byte tokenizer — here the worker owns the 8,192-vocab BPE, so the wire
 * carries text and the client stays thin).
 *
 * Protocol (mirrors workers/llm.worker.ts conventions):
 *   in:  init
 *        loadModel { modelBytes, tokenizerBytes }   (both transferred)
 *        generate { prompt, maxTokens, temperature, seed }
 *        cancelGenerate                             (bypasses the client queue;
 *                                                   honoured between tokens)
 *   out: ready
 *        modelLoaded { params, nLayer, nEmbd, nHead, ctxLen, vocabSize }
 *        genChunk { text, tokens, done }            (empty text + done ends)
 *        genCancelled { tokens }                    (partial text stays)
 *        error { message }                          (human sentences)
 *
 * The worker never touches the network — the main thread fetches both
 * artifacts and transfers the bytes in. Generation yields between tokens so
 * cancelGenerate messages land; the rng stream is unaffected by yielding.
 */

import { mulberry32 } from "@/lib/llm/prng";
import { TOP_K } from "@/lib/storyteller/config";
import { decodeStoryteller } from "@/lib/storyteller/container";
import {
  createStorytellerModel,
  generateStoryteller,
  StorytellerModel,
} from "@/lib/storyteller/model";
import {
  buildTokenizer,
  StorytellerTokenizer,
  StreamingStorytellerDecoder,
} from "@/lib/storyteller/tokenizer";

export type StorytellerRequest =
  | { type: "init" }
  | { type: "loadModel"; modelBytes: ArrayBuffer; tokenizerBytes: ArrayBuffer }
  | {
      type: "generate";
      prompt: string;
      maxTokens: number;
      temperature: number;
      seed: number;
    }
  | { type: "cancelGenerate" };

export type StorytellerResponse =
  | { type: "ready" }
  | {
      type: "modelLoaded";
      params: number;
      nLayer: number;
      nEmbd: number;
      nHead: number;
      ctxLen: number;
      vocabSize: number;
    }
  | { type: "genChunk"; text: string; tokens: number; done: boolean }
  | { type: "genCancelled"; tokens: number }
  | { type: "error"; message: string };

const post = (msg: StorytellerResponse): void => {
  self.postMessage(msg);
};

let model: StorytellerModel | null = null;
let tokenizer: StorytellerTokenizer | null = null;
const cancelFlag = { cancelled: false };

self.onmessage = async (
  ev: MessageEvent<StorytellerRequest>,
): Promise<void> => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "init": {
        post({ type: "ready" });
        return;
      }
      case "loadModel": {
        const decoded = decodeStoryteller(new Uint8Array(msg.modelBytes));
        model = createStorytellerModel(decoded);
        tokenizer = buildTokenizer(
          new TextDecoder().decode(new Uint8Array(msg.tokenizerBytes)),
        );
        post({
          type: "modelLoaded",
          params: decoded.paramCount,
          nLayer: decoded.config.nLayer,
          nEmbd: decoded.config.nEmbd,
          nHead: decoded.config.nHead,
          ctxLen: decoded.config.ctxLen,
          vocabSize: decoded.config.vocabSize,
        });
        return;
      }
      case "cancelGenerate": {
        cancelFlag.cancelled = true;
        return;
      }
      case "generate": {
        if (!model || !tokenizer) {
          throw new Error(
            "The storyteller model hasn't finished loading — try again in a moment.",
          );
        }
        cancelFlag.cancelled = false;
        const stream = new StreamingStorytellerDecoder(tokenizer);
        let promptIds = Array.from(tokenizer.encode(msg.prompt));
        if (promptIds.length === 0) promptIds = [tokenizer.eotId]; // fresh story
        const result = await generateStoryteller(model, promptIds, {
          maxTokens: msg.maxTokens,
          temperature: msg.temperature,
          topK: TOP_K,
          rng: mulberry32(msg.seed),
          isCancelled: () => cancelFlag.cancelled,
          yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
          onToken: (id, tokensSoFar) => {
            const text = stream.push(id);
            if (text)
              post({
                type: "genChunk",
                text,
                tokens: tokensSoFar,
                done: false,
              });
          },
        });
        if (result.cancelled) {
          post({ type: "genCancelled", tokens: result.tokensGenerated });
        } else {
          post({
            type: "genChunk",
            text: "",
            tokens: result.tokensGenerated,
            done: true,
          });
        }
        return;
      }
    }
  } catch (err) {
    post({
      type: "error",
      message:
        err instanceof Error
          ? err.message
          : "The storyteller hit an unexpected error.",
    });
  }
};
