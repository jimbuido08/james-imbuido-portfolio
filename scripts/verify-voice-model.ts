/**
 * Cross-language parity gate for the voice-cloning pipeline
 * (run: npm run verify:voice-model). Mirrors training/voice/make_fixtures.py,
 * whose golden values live in training/voice/fixtures/voice_fixtures.json:
 *
 * 1. Text parity — every fixture string maps to the exact symbol-id sequence
 *    the reference repo's english_cleaners + text_to_sequence produce.
 * 2. Mel parity — the TS STFT/mel stack reproduces librosa's encoder (power)
 *    and synthesizer (magnitude + dB + ±4) mel paths for the tone-2s fixture
 *    wav, element-wise against 5-significant-digit stored values.
 * 3. Embedding parity — the full encoder pipeline (TS mel → partial slices →
 *    zero-padded partials → ONNX speaker encoder → mean + L2) reproduces the
 *    reference repo's PyTorch embedding.
 * 4. Graph parity — the fp32 exports reproduce ORT's golden outputs for the
 *    synth-encode pass, 12 chained decoder steps from zero state, and 4
 *    chained voc-chunk frames (u = 0.5 argmax path), all through the wasm
 *    backend the browser uses (numThreads 1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as ort from "onnxruntime-web/wasm";

import { encoderMel, synthMel } from "../lib/voice/mel";
import {
  fixtureSpeakerEmbedding,
  GRAPH_INPUTS,
  VOC_CLASSES,
} from "../lib/voice/modelContract";
import { computePartialSlices } from "../lib/voice/partialSlices";
import { textToSequence } from "../lib/voice/textFrontend";

ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const REPO = resolve(import.meta.dirname, "..");
const FIXTURES = resolve(REPO, "training/voice/fixtures");
const EXPORT = resolve(REPO, "training/voice/export");

interface TextCase {
  text: string;
  ids: number[];
}
interface MelCase {
  wav: string;
  seconds: number;
  encoder_mel: { frames: number; bins: number; values?: number[][] };
  synth_mel: { frames: number; bins: number; values?: number[][] };
}
interface EmbedCase {
  n_partials: number;
  embed: number[];
}
interface GraphCases {
  synth_encode: { text: number[]; enc_seq: number[][]; enc_seq_proj: number[][] };
  synth_steps: Array<{ mel: number[][]; stop: number[][] }>;
  voc_frames: Array<{ samples: number[] }>;
}
interface VoiceFixtures {
  mel_cases: MelCase[];
  text_cases: TextCase[];
  embed_cases?: Record<string, EmbedCase>;
  graph_cases?: GraphCases;
}

let failures = 0;
let checks = 0;

function check(ok: boolean, message: string): void {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

/** Stored values are rounded to 5 significant digits and both sides run
 * different FFT stacks — element-wise relative tolerance with an absolute
 * floor for near-zero mel bins. */
function closeTo(actual: number, expected: number, absFloor: number): boolean {
  return Math.abs(actual - expected) <= absFloor + 1e-3 * Math.abs(expected);
}

const MEL_ABS_FLOOR = 1e-6;
/** Chained decoder steps compound fp32 rounding on near-zero mel bins (worst
 * observed |delta| ~ 4e-5 on the ±4 scale) — pure accumulation noise, so the
 * graph comparisons get a wider absolute floor. */
const GRAPH_ABS_FLOOR = 1e-4;

function compareMatrix(
  label: string,
  actual: ArrayLike<ArrayLike<number>>,
  expected: number[][],
  absFloor: number,
): void {
  let worst = 0;
  let bad = 0;
  for (let t = 0; t < expected.length; t++) {
    for (let b = 0; b < expected[t].length; b++) {
      const a = actual[t][b];
      const e = expected[t][b];
      if (!closeTo(a, e, absFloor)) {
        bad += 1;
        if (bad <= 3) {
          console.error(
            `  FAIL ${label}[${t}][${b}]: got ${a.toPrecision(6)}, expected ${e.toPrecision(6)}`,
          );
        }
      }
      if (e !== 0) worst = Math.max(worst, Math.abs(a - e) / Math.abs(e));
    }
  }
  check(bad === 0, `${label}: ${bad} element(s) outside tolerance`);
  if (bad === 0) console.log(`  ${label} ok (worst rel diff ${worst.toExponential(2)})`);
}

/** 16-bit mono PCM → float in [-1, 1) — the fixture wav layout. */
function readWav(path: string): Float32Array {
  const raw = readFileSync(path);
  const data = raw.subarray(44); // 44-byte canonical header, validated below
  const view = new DataView(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength,
  );
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...raw.subarray(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE" || ascii(36, 4) !== "data") {
    throw new Error(`unexpected wav layout: ${path}`);
  }
  const dataLen = view.getUint32(40, true);
  const pcm = new Int16Array(data.buffer, data.byteOffset, dataLen / 2);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32767;
  return out;
}

function session(name: string): Promise<ort.InferenceSession> {
  const bytes = new Uint8Array(readFileSync(resolve(EXPORT, `${name}.onnx`)));
  return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
}

async function assertInputNames(
  s: ort.InferenceSession,
  key: keyof typeof GRAPH_INPUTS,
): Promise<void> {
  const expected = [...GRAPH_INPUTS[key]];
  const actual = s.inputNames.slice().sort();
  const sorted = expected.slice().sort();
  check(
    actual.length === sorted.length && actual.every((v, i) => v === sorted[i]),
    `${key} graph inputs: got [${s.inputNames}], expected [${expected}]`,
  );
}

async function main(): Promise<void> {
  const fixtures: VoiceFixtures = JSON.parse(
    readFileSync(resolve(FIXTURES, "voice_fixtures.json"), "utf-8"),
  );

  // ---- 1. Text parity ------------------------------------------------------
  console.log(`Text parity: ${fixtures.text_cases.length} cases`);
  for (const tc of fixtures.text_cases) {
    const ids = textToSequence(tc.text);
    check(
      ids.length === tc.ids.length && ids.every((v, i) => v === tc.ids[i]),
      `text "${tc.text.slice(0, 40)}": ids diverge ` +
        `(first at ${ids.findIndex((v, i) => v !== tc.ids[i])})`,
    );
  }
  if (failures === 0) console.log("  all sequences exact");

  // ---- 2. Mel parity -------------------------------------------------------
  const tone2s = fixtures.mel_cases.find((c) => c.wav === "tone-2s.wav");
  if (tone2s?.encoder_mel.values && tone2s.synth_mel.values) {
    console.log("Mel parity: tone-2s.wav");
    const wav = readWav(resolve(FIXTURES, "tone-2s.wav"));
    const encMel = encoderMel(wav);
    check(
      encMel.length === tone2s.encoder_mel.frames &&
        encMel[0].length === tone2s.encoder_mel.bins,
      `encoder mel shape ${encMel.length}×${encMel[0].length}`,
    );
    compareMatrix("encoder_mel", encMel, tone2s.encoder_mel.values, MEL_ABS_FLOOR);
    const synMel = synthMel(wav);
    check(
      synMel.length === tone2s.synth_mel.frames &&
        synMel[0].length === tone2s.synth_mel.bins,
      `synth mel shape ${synMel.length}×${synMel[0].length}`,
    );
    compareMatrix("synth_mel", synMel, tone2s.synth_mel.values, MEL_ABS_FLOOR);
  } else {
    console.log("Mel parity: no stored values — skipped");
  }
  for (const mc of fixtures.mel_cases) {
    if (mc.wav === "tone-2s.wav") continue;
    const wav = readWav(resolve(FIXTURES, mc.wav));
    check(encoderMel(wav).length === mc.encoder_mel.frames, `${mc.wav} encoder frames`);
    check(synthMel(wav).length === mc.synth_mel.frames, `${mc.wav} synth frames`);
  }

  // ---- 3. Embedding parity --------------------------------------------------
  const encoder = await session("voice-encoder");
  await assertInputNames(encoder, "encoder");
  if (fixtures.embed_cases) {
    const wavs = Object.keys(fixtures.embed_cases);
    console.log(`Embedding parity: ${wavs.length} wav(s)`);
    for (const name of wavs) {
      const expected = fixtures.embed_cases[name];
      const wav = readWav(resolve(FIXTURES, name));
      const mel = encoderMel(wav); // (T, 40) frames-major
      const { melSlices } = computePartialSlices(wav.length);
      check(melSlices.length === expected.n_partials, `${name}: n_partials`);
      const partialEmbeds: Float32Array[] = [];
      for (const slice of melSlices) {
        // Zero-pad short tail partials (bins-major [40, 160] graph input).
        const partial = new Float32Array(40 * 160);
        const frames = Math.min(slice.stop, mel.length) - slice.start;
        for (let t = 0; t < frames; t++) {
          for (let b = 0; b < 40; b++) {
            partial[b * 160 + t] = mel[slice.start + t][b];
          }
        }
        const result = await encoder.run({
          mel_partial: new ort.Tensor("float32", partial, [1, 40, 160]),
        });
        partialEmbeds.push(result.embed.data as Float32Array);
      }
      const raw = new Float64Array(256);
      for (const e of partialEmbeds) {
        for (let i = 0; i < 256; i++) raw[i] += e[i];
      }
      let norm = 0;
      for (let i = 0; i < 256; i++) norm += raw[i] * raw[i];
      norm = Math.sqrt(norm);
      let dot = 0;
      let maxDelta = 0;
      for (let i = 0; i < 256; i++) {
        const v = raw[i] / norm;
        const e = expected.embed[i];
        dot += v * e;
        maxDelta = Math.max(maxDelta, Math.abs(v - e));
      }
      check(dot >= 0.9999, `${name}: embedding cosine ${dot.toFixed(6)}`);
      check(maxDelta <= 0.01, `${name}: embedding max|Δ| ${maxDelta.toFixed(4)}`);
      if (dot >= 0.9999 && maxDelta <= 0.01) {
        console.log(`  ${name} ok (cosine ${dot.toFixed(6)})`);
      }
    }
  }

  // ---- 4. Graph parity ------------------------------------------------------
  const graphCases = fixtures.graph_cases;
  if (graphCases) {
    console.log("Graph parity: fp32 exports via wasm");

    // synth-encode — same inputs as the fixture generator.
    const synthEncode = await session("voice-synth-encode");
    await assertInputNames(synthEncode, "synthEncode");
    const spk = fixtureSpeakerEmbedding();
    const encodeResult = await synthEncode.run({
      text: new ort.Tensor("int64", BigInt64Array.from(
        graphCases.synth_encode.text.map(BigInt),
      ), [1, graphCases.synth_encode.text.length]),
      spk_embed: new ort.Tensor("float32", spk, [1, 256]),
    });
    {
      const encSeq = encodeResult.enc_seq.data as Float32Array;
      const t = graphCases.synth_encode.text.length;
      const rows: Float32Array[] = [];
      for (let i = 0; i < t; i++) rows.push(encSeq.subarray(i * 512, (i + 1) * 512));
      compareMatrix("enc_seq", rows, graphCases.synth_encode.enc_seq, GRAPH_ABS_FLOOR);
      const proj = encodeResult.enc_seq_proj.data as Float32Array;
      const projRows: Float32Array[] = [];
      for (let i = 0; i < t; i++) projRows.push(proj.subarray(i * 128, (i + 1) * 128));
      compareMatrix("enc_seq_proj", projRows, graphCases.synth_encode.enc_seq_proj, GRAPH_ABS_FLOOR);
    }

    // synth-step — 12 chained steps from Tacotron.generate's zero state.
    const synthStep = await session("voice-synth-step");
    await assertInputNames(synthStep, "synthStep");
    const t = graphCases.synth_encode.text.length;
    const zeros = (n: number) => new Float32Array(n);
    const state: Record<string, ort.Tensor> = {
      enc_seq: encodeResult.enc_seq,
      enc_seq_proj: encodeResult.enc_seq_proj,
      chars: new ort.Tensor("int64", BigInt64Array.from(
        graphCases.synth_encode.text.map(BigInt),
      ), [1, t]),
      prenet_in: new ort.Tensor("float32", zeros(80), [1, 80]),
      attn_h: new ort.Tensor("float32", zeros(128), [1, 128]),
      rnn1_h: new ort.Tensor("float32", zeros(1024), [1, 1024]),
      rnn2_h: new ort.Tensor("float32", zeros(1024), [1, 1024]),
      rnn1_c: new ort.Tensor("float32", zeros(1024), [1, 1024]),
      rnn2_c: new ort.Tensor("float32", zeros(1024), [1, 1024]),
      context: new ort.Tensor("float32", zeros(512), [1, 512]),
      cumulative: new ort.Tensor("float32", zeros(t), [1, t]),
    };
    for (let step = 0; step < graphCases.synth_steps.length; step++) {
      const out = await synthStep.run(state);
      const mel = out.mel.data as Float32Array; // (1, 80, r) bins-major
      const r = out.mel.dims[2];
      const rows: Float32Array[] = [];
      for (let f = 0; f < r; f++) {
        const row = new Float32Array(80);
        for (let b = 0; b < 80; b++) row[b] = mel[b * r + f];
        rows.push(row);
      }
      compareMatrix(`synth_step[${step}].mel`, rows, graphCases.synth_steps[step].mel, GRAPH_ABS_FLOOR);
      const stop = (out.stop.data as Float32Array)[0];
      check(
        closeTo(stop, graphCases.synth_steps[step].stop[0][0], GRAPH_ABS_FLOOR),
        `synth_step[${step}].stop: got ${stop}, expected ${graphCases.synth_steps[step].stop[0][0]}`,
      );
      // Rotate next_* outputs into the next run's inputs.
      for (const name of [
        "attn_h", "rnn1_h", "rnn2_h", "rnn1_c", "rnn2_c", "context", "cumulative",
      ] as const) {
        state[name] = out[`next_${name}`];
      }
      // Feed-forward rule: the next prenet input is the last produced frame.
      const last = new Float32Array(80);
      for (let b = 0; b < 80; b++) last[b] = mel[b * r + (r - 1)];
      state.prenet_in = new ort.Tensor("float32", last, [1, 80]);
    }

    // voc-chunk — TS synth mel / 4, first 32 frames, 4 chained frames, u=0.5.
    const wav = readWav(resolve(FIXTURES, "tone-2s.wav"));
    const synMel = synthMel(wav);
    const frames = 32;
    const melInput = new Float32Array(80 * frames); // bins-major [1, 80, frames]
    for (let t2 = 0; t2 < frames; t2++) {
      for (let b = 0; b < 80; b++) melInput[b * frames + t2] = synMel[t2][b] / 4;
    }
    const vocUpsample = await session("voice-voc-upsample");
    await assertInputNames(vocUpsample, "vocUpsample");
    const up = await vocUpsample.run({
      mel: new ort.Tensor("float32", melInput, [1, 80, frames]),
    });
    const melsCond = up.mels_cond.data as Float32Array; // (1, 200*frames, 80)
    const aux = up.aux.data as Float32Array; // (1, 200*frames, 128)
    const vocChunk = await session("voice-voc-chunk");
    await assertInputNames(vocChunk, "vocChunk");
    let h1: Float32Array<ArrayBufferLike> = zeros(512);
    let h2: Float32Array<ArrayBufferLike> = zeros(512);
    let xPrev: Float32Array<ArrayBufferLike> = zeros(1);
    for (let frame = 0; frame < graphCases.voc_frames.length; frame++) {
      const lo = frame * 200;
      const mels = new Float32Array(200 * 80);
      const auxSlice = new Float32Array(200 * 128);
      for (let i = 0; i < 200; i++) {
        mels.set(melsCond.subarray((lo + i) * 80, (lo + i + 1) * 80), i * 80);
        auxSlice.set(aux.subarray((lo + i) * 128, (lo + i + 1) * 128), i * 128);
      }
      const u = new Float32Array(200 * VOC_CLASSES).fill(0.5);
      const chunkOut = await vocChunk.run({
        x_prev: new ort.Tensor("float32", xPrev, [1, 1]),
        mels: new ort.Tensor("float32", mels, [200, 80]),
        aux: new ort.Tensor("float32", auxSlice, [200, 128]),
        h1: new ort.Tensor("float32", h1, [1, 512]),
        h2: new ort.Tensor("float32", h2, [1, 512]),
        u: new ort.Tensor("float32", u, [200, VOC_CLASSES]),
      });
      const samples = chunkOut.samples.data as Float32Array;
      const expected = graphCases.voc_frames[frame].samples;
      let mismatches = 0;
      for (let i = 0; i < 200; i++) {
        if (samples[i] !== expected[i]) mismatches += 1;
      }
      check(
        mismatches === 0,
        `voc_frame[${frame}]: ${mismatches}/200 sampled codes differ from golden`,
      );
      if (mismatches === 0) console.log(`  voc_frame[${frame}] ok (exact argmax codes)`);
      h1 = chunkOut.next_h1.data as Float32Array;
      h2 = chunkOut.next_h2.data as Float32Array;
      xPrev = chunkOut.next_x_prev.data as Float32Array;
    }
  } else {
    console.log("Graph parity: no golden cases — skipped");
  }

  console.log(`\n${checks} checks, ${failures} failure(s)`);
  if (failures > 0) {
    console.error("verify:voice-model FAILED");
    process.exit(1);
  }
  console.log("verify:voice-model passed");
}

void main();