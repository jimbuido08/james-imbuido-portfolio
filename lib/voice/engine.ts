/**
 * The browser voice-cloning engine — the JS-side driver of the SV2TTS ONNX
 * graphs, mirroring the reference repo's `Tacotron.generate` and
 * `WaveRNN.generate` semantics step for step (see
 * docs/notes/voice-cloning-architecture.md §1/§2). Framework-free so the
 * worker owns it; UI state lives in components/voice.
 *
 * Device-only by design: every input (recording, embedding, text, seed) and
 * every output (audio) stays in this process. Nothing here can send data
 * anywhere — the only network traffic in /voice is the reward claim, which
 * carries an empty body (Milestone E).
 */
import * as ort from "onnxruntime-web/wasm";

import { encoderMel } from "./mel";
import {
  createSeededRandom,
  ENCODER_MELS,
  ENCODER_PARTIAL_FRAMES,
  GRAPH_INPUTS,
  SPEAKER_EMBEDDING_SIZE,
  SYNTH_MAX_MEL_FRAMES,
  SYNTH_MAX_TEXT_SYMBOLS,
  SYNTH_REDUCTION_R,
  SYNTH_STATE_NAMES,
  SYNTH_STOP_THRESHOLD,
  SYNTH_TRIM_THRESHOLD,
  VOICE_GRAPHS,
  VOICE_MODEL_BASE,
  VOC_CHUNK_SAMPLES,
  VOC_CHUNK_U_DRAWS,
  VOC_CLASSES,
  VOC_DEEMPHASIS,
} from "./modelContract";
import { computePartialSlices } from "./partialSlices";
import { textToSequence } from "./textFrontend";

ort.env.wasm.wasmPaths = "/models/ort/";
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

/** The vocoder's end-of-generation fade: last 20 hops (200 each). */
const FADE_OUT_SAMPLES = 20 * 200;

export type EngineStage =
  | "loading"
  | "encoder"
  | "text-encode"
  | "decode"
  | "vocode";

export interface EngineProgress {
  stage: EngineStage;
  current?: number;
  total?: number;
}

type ProgressFn = (progress: EngineProgress) => void;

interface Sessions {
  encoder: ort.InferenceSession;
  synthEncode: ort.InferenceSession;
  synthStep: ort.InferenceSession;
  vocUpsample: ort.InferenceSession;
  vocChunk: ort.InferenceSession;
}

function zerosTensor(dims: number[]): ort.Tensor {
  return new ort.Tensor("float32", new Float32Array(dims.reduce((a, b) => a * b, 1)), dims);
}

/** Retries for a model download: the synthesis graphs total ~111 MB, and a
 * dropped connection mid-flight was the commonest real-world failure (raw
 * "Failed to fetch" surfacing as a synthesis error). 4xx statuses won't heal,
 * so only network errors and CDN 5xx get another attempt. */
const GRAPH_FETCH_RETRIES = 2;
const GRAPH_RETRY_DELAYS_MS = [1000, 3000];

async function fetchGraph(name: string): Promise<Uint8Array> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= GRAPH_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, GRAPH_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const response = await fetch(`${VOICE_MODEL_BASE}${name}`);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) {
        throw lastError; // 404 etc. — retrying cannot help
      }
    } catch (err) {
      // Our own HTTP-status error (non-TypeError) was already judged final.
      if (!(err instanceof TypeError)) throw err;
      lastError = err;
    }
  }
  throw new Error(
    `the model download kept failing (${lastError?.message ?? "network error"}) — check your connection and try again`,
  );
}

async function loadModel(name: string): Promise<ort.InferenceSession> {
  const bytes = await fetchGraph(name);
  return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
}

export interface VoiceEngine {
  /** Partial-utterance speaker embedding from 16 kHz mono PCM. */
  embed(pcm: Float32Array, onProgress: ProgressFn): Promise<Float32Array>;
  /** Download + compile every synthesis graph ahead of the Synthesize click —
   * embed() only loads the 5.7 MB encoder, so without this the Synthesize
   * click starts a ~111 MB download on the spot. Errors are swallowed here;
   * synthesize() retries and surfaces them with the user-facing message. */
  preload(onProgress: ProgressFn): Promise<void>;
  /** Mel → audio: returns 16 kHz mono samples. */
  synthesize(
    text: string,
    spkEmbed: Float32Array,
    seed: number,
    onProgress: ProgressFn,
  ): Promise<Float32Array>;
}

export function createVoiceEngine(): VoiceEngine {
  const sessions: Partial<Sessions> = {};

  async function require<K extends keyof Sessions>(
    key: K,
    onProgress: ProgressFn,
  ): Promise<NonNullable<Sessions[K]>> {
    const existing = sessions[key];
    if (existing) return existing;
    onProgress({ stage: "loading" });
    const session = await loadModel(VOICE_GRAPHS[key]);
    sessions[key] = session;
    return session;
  }

  return {
    async embed(pcm, onProgress) {
      const encoder = await require("encoder", onProgress);
      onProgress({ stage: "encoder" });

      // encoder.audio.wav_to_mel_spectrogram — (T, 40) frames-major power mel.
      const mel = encoderMel(pcm);
      const { melSlices } = computePartialSlices(pcm.length);
      const partialEmbeds: Float32Array[] = [];
      for (const slice of melSlices) {
        // Zero-pad short tail partials (channel-major [1, 40, 160] input).
        const partial = new Float32Array(ENCODER_MELS * ENCODER_PARTIAL_FRAMES);
        const frames = Math.min(slice.stop, mel.length) - slice.start;
        for (let t = 0; t < frames; t++) {
          for (let b = 0; b < ENCODER_MELS; b++) {
            partial[b * ENCODER_PARTIAL_FRAMES + t] = mel[slice.start + t][b];
          }
        }
        const result = await encoder.run({
          mel_partial: new ort.Tensor("float32", partial, [
            1, ENCODER_MELS, ENCODER_PARTIAL_FRAMES,
          ]),
        });
        partialEmbeds.push(result.embed.data as Float32Array);
      }
      const raw = new Float64Array(SPEAKER_EMBEDDING_SIZE);
      for (const e of partialEmbeds) {
        for (let i = 0; i < SPEAKER_EMBEDDING_SIZE; i++) raw[i] += e[i];
      }
      let norm = 0;
      for (let i = 0; i < SPEAKER_EMBEDDING_SIZE; i++) norm += raw[i] * raw[i];
      norm = Math.sqrt(norm);
      const embed = new Float32Array(SPEAKER_EMBEDDING_SIZE);
      for (let i = 0; i < SPEAKER_EMBEDDING_SIZE; i++) embed[i] = raw[i] / norm;
      return embed;
    },

    async preload(onProgress) {
      for (const key of ["synthEncode", "synthStep", "vocUpsample", "vocChunk"] as const) {
        try {
          await require(key, onProgress);
        } catch {
          return; // synthesize() retries and reports; preload stays silent
        }
      }
    },

    async synthesize(text, spkEmbed, seed, onProgress) {
      const synthEncode = await require("synthEncode", onProgress);
      const synthStep = await require("synthStep", onProgress);
      const vocUpsample = await require("vocUpsample", onProgress);
      const vocChunk = await require("vocChunk", onProgress);

      // ---- text → symbols --------------------------------------------------
      let ids = textToSequence(text);
      if (ids.length > SYNTH_MAX_TEXT_SYMBOLS) {
        ids = ids.slice(0, SYNTH_MAX_TEXT_SYMBOLS);
      }
      const t = ids.length;

      // ---- Tacotron encoder pass ------------------------------------------
      onProgress({ stage: "text-encode" });
      const encoded = await synthEncode.run({
        text: new ort.Tensor(
          "int64",
          BigInt64Array.from(ids.map(BigInt)),
          [1, t],
        ),
        spk_embed: new ort.Tensor("float32", spkEmbed, [1, SPEAKER_EMBEDDING_SIZE]),
      });
      const encSeq = encoded.enc_seq;
      const encSeqProj = encoded.enc_seq_proj;

      // ---- Decoder loop (Tacotron.generate) --------------------------------
      // Zero initial state; prenet_in = last frame of the previous chunk.
      const state: Record<string, ort.Tensor> = {
        enc_seq: encSeq,
        enc_seq_proj: encSeqProj,
        chars: new ort.Tensor(
          "int64",
          BigInt64Array.from(ids.map(BigInt)),
          [1, t],
        ),
        prenet_in: zerosTensor([1, 80]),
        attn_h: zerosTensor([1, 128]),
        rnn1_h: zerosTensor([1, 1024]),
        rnn2_h: zerosTensor([1, 1024]),
        rnn1_c: zerosTensor([1, 1024]),
        rnn2_c: zerosTensor([1, 1024]),
        context: zerosTensor([1, 512]),
        cumulative: zerosTensor([1, t]),
      };
      const melChunks: Float32Array[] = []; // per step, [80, r] frames-major
      const maxSteps = Math.ceil(SYNTH_MAX_MEL_FRAMES / SYNTH_REDUCTION_R);
      let stepFrame = 0; // the reference loop's `t` (mel frames)
      let stopped = false;
      for (let step = 0; step < maxSteps; step++) {
        const out = await synthStep.run(state);
        const mel = out.mel.data as Float32Array; // [80, r] bins-major
        const r = out.mel.dims[2];
        const chunk = new Float32Array(80 * r);
        for (let b = 0; b < 80; b++) {
          for (let f = 0; f < r; f++) {
            chunk[b * r + f] = mel[b * r + f];
          }
        }
        melChunks.push(chunk);
        const stop = (out.stop.data as Float32Array)[0];
        if (stop > SYNTH_STOP_THRESHOLD && stepFrame > 10) {
          stopped = true;
        }
        for (const name of SYNTH_STATE_NAMES) {
          state[name] = out[`next_${name}`];
        }
        const last = new Float32Array(80);
        for (let b = 0; b < 80; b++) last[b] = mel[b * r + (r - 1)];
        state.prenet_in = new ort.Tensor("float32", last, [1, 80]);
        stepFrame += r;
        if (stopped) break;
        if (step % 8 === 0) onProgress({ stage: "decode", current: step, total: maxSteps });
      }
      onProgress({ stage: "decode", current: melChunks.length, total: melChunks.length });

      // ---- Trim trailing silence (synthesizer/inference.py) ----------------
      const frames: Float32Array[] = [];
      for (const chunk of melChunks) {
        for (let f = 0; f < SYNTH_REDUCTION_R; f++) {
          const frame = new Float32Array(80);
          for (let b = 0; b < 80; b++) frame[b] = chunk[b * SYNTH_REDUCTION_R + f];
          frames.push(frame);
        }
      }
      while (
        frames.length > 1 &&
        Math.max(...frames[frames.length - 1]) < SYNTH_TRIM_THRESHOLD
      ) {
        frames.pop();
      }
      const melFrames = frames.length;
      if (melFrames < 2) {
        throw new Error("synthesis produced no audio — try a longer prompt");
      }

      // ---- Vocoder conditioning (WaveRNN.generate precompute) --------------
      onProgress({ stage: "vocode", current: 0, total: melFrames });
      const melInput = new Float32Array(80 * melFrames); // bins-major [1, 80, T]
      for (let f = 0; f < melFrames; f++) {
        for (let b = 0; b < 80; b++) melInput[b * melFrames + f] = frames[f][b] / 4;
      }
      const up = await vocUpsample.run({
        mel: new ort.Tensor("float32", melInput, [1, 80, melFrames]),
      });
      const melsCond = up.mels_cond.data as Float32Array; // [200T, 80]
      const aux = up.aux.data as Float32Array; // [200T, 128]

      // ---- Chunked vocoder loop --------------------------------------------
      const random = createSeededRandom(seed);
      let h1: Float32Array<ArrayBufferLike> = new Float32Array(512);
      let h2: Float32Array<ArrayBufferLike> = new Float32Array(512);
      let xPrev: Float32Array<ArrayBufferLike> = new Float32Array(1);
      const codes = new Float32Array(melFrames * VOC_CHUNK_SAMPLES);
      for (let frame = 0; frame < melFrames; frame++) {
        // One uniform per (sample, class) — the in-graph gumbel-max needs
        // independent noise across the 512 classes per sample.
        const u = new Float32Array(VOC_CHUNK_U_DRAWS);
        for (let i = 0; i < VOC_CHUNK_U_DRAWS; i++) u[i] = random();
        const out = await vocChunk.run({
          x_prev: new ort.Tensor("float32", xPrev, [1, 1]),
          mels: new ort.Tensor(
            "float32",
            melsCond.slice(frame * VOC_CHUNK_SAMPLES * 80, (frame + 1) * VOC_CHUNK_SAMPLES * 80),
            [VOC_CHUNK_SAMPLES, 80],
          ),
          aux: new ort.Tensor(
            "float32",
            aux.slice(frame * VOC_CHUNK_SAMPLES * 128, (frame + 1) * VOC_CHUNK_SAMPLES * 128),
            [VOC_CHUNK_SAMPLES, 128],
          ),
          h1: new ort.Tensor("float32", h1, [1, 512]),
          h2: new ort.Tensor("float32", h2, [1, 512]),
          u: new ort.Tensor("float32", u, [VOC_CHUNK_SAMPLES, VOC_CLASSES]),
        });
        codes.set(out.samples.data as Float32Array, frame * VOC_CHUNK_SAMPLES);
        h1 = out.next_h1.data as Float32Array;
        h2 = out.next_h2.data as Float32Array;
        xPrev = out.next_x_prev.data as Float32Array;
        if (frame % 4 === 0 || frame === melFrames - 1) {
          onProgress({ stage: "vocode", current: frame + 1, total: melFrames });
        }
      }

      // ---- Output conversion (decode_mu_law + de_emphasis) ------------------
      const mu = VOC_CLASSES - 1; // 511
      const x = new Float32Array(codes.length);
      for (let i = 0; i < codes.length; i++) {
        const y = (2 * codes[i]) / mu - 1;
        x[i] = (Math.sign(y) / mu) * (Math.pow(mu + 1, Math.abs(y)) - 1);
      }
      // De-emphasis IIR: out[n] = x[n] + 0.97 · out[n−1].
      const audio = new Float32Array(codes.length);
      audio[0] = x[0];
      for (let i = 1; i < codes.length; i++) {
        audio[i] = x[i] + VOC_DEEMPHASIS * audio[i - 1];
      }

      // Trim to wave_len and fade the last 20 hops.
      const waveLen = (melFrames - 1) * 200;
      const fadeStart = Math.max(0, waveLen - FADE_OUT_SAMPLES);
      for (let i = fadeStart; i < waveLen; i++) {
        audio[i] *= (waveLen - i) / FADE_OUT_SAMPLES;
      }
      return audio.subarray(0, waveLen);
    },
  };
}

// Graph input names are asserted once at module load — a renamed graph input
// must fail loudly here rather than mysteriously at run time.
for (const key of ["encoder", "synthEncode", "synthStep", "vocUpsample", "vocChunk"] as const) {
  if (!GRAPH_INPUTS[key]) throw new Error(`voice engine: missing contract for ${key}`);
}