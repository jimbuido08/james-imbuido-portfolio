/**
 * Single source of truth for the browser voice-cloning ONNX contract — the TS
 * mirror of the export scripts in `training/voice/` (which follow the
 * CorentinJ/Real-Time-Voice-Cloning reference stack). Every constant here is
 * either read from the reference repo's source or baked at export time; the
 * golden-fixture verifier (`npm run verify:voice-model`) proves the two sides
 * agree before any artifact ships.
 *
 * Contract details and gate numbers: docs/notes/voice-cloning-architecture.md.
 */

/** All six graphs live under this path (lazy-loaded per stage like the chess
 * models; wasm runtime is self-hosted at `/models/ort/`). */
export const VOICE_MODEL_BASE = "/models/voice/";

export const VOICE_GRAPHS = {
  encoder: "voice-encoder.onnx",
  synthEncode: "voice-synth-encode.onnx",
  synthStep: "voice-synth-step.onnx",
  vocUpsample: "voice-voc-upsample.onnx",
  vocStep: "voice-voc-step.onnx",
  vocChunk: "voice-voc-chunk.onnx",
} as const;

// ---- speaker encoder (encoder/params_data.py, params_model.py) ------------

export const ENCODER_SR = 16000;
export const ENCODER_N_FFT = 400; // 25 ms window
export const ENCODER_HOP = 160; // 10 ms step
export const ENCODER_MELS = 40;
/** Partial utterances: 160 frames (~1.6 s) embedded, 80-frame (50 %) step. */
export const ENCODER_PARTIAL_FRAMES = 160;
export const ENCODER_PARTIAL_STEP = 80;
/** Tail partials kept only if ≥ 75 % real frames, else dropped. */
export const ENCODER_MIN_PAD_COVERAGE = 0.75;
export const SPEAKER_EMBEDDING_SIZE = 256;

// ---- synthesizer (synthesizer/hparams.py) ---------------------------------

export const SYNTH_SR = 16000;
export const SYNTH_N_FFT = 800;
export const SYNTH_HOP = 200; // 12.5 ms — the vocoder's frame step
export const SYNTH_MELS = 80;
export const SYNTH_FMIN = 55;
export const SYNTH_FMAX = 7600;
export const SYNTH_PREEMPHASIS = 0.97;
export const SYNTH_MIN_LEVEL_DB = -100;
export const SYNTH_REF_LEVEL_DB = 20;
export const SYNTH_MAX_ABS_VALUE = 4.0;
/** Decoder reduction factor baked from the checkpoint buffer (verified r=2):
 * each synth-step run produces this many mel frames. */
export const SYNTH_REDUCTION_R = 2;
/** Stop-token sigmoid > 0.5 on all entries; ignored for the first steps. */
export const SYNTH_STOP_THRESHOLD = 0.5;
export const SYNTH_MIN_STOP_STEPS = 11; // t > 10
/** Trailing mel frames below this (normalised scale) are trimmed. */
export const SYNTH_TRIM_THRESHOLD = -3.4;
/** Text is capped at 200 symbols (encode graph cost is linear in T). */
export const SYNTH_MAX_TEXT_SYMBOLS = 200;
/** Decoder safety cap: ~10 words ≈ 640 mel frames. */
export const SYNTH_MAX_MEL_FRAMES = 800;

// ---- text frontend (synthesizer/utils/{symbols,text,cleaners}.py) ---------

/** `symbols = [_pad, _eos] + 64 ASCII` — 66 ids, `_pad`=0, `_eos`=1. */
const CHARACTER_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!\'\"(),-.:;? ";

export const VOICE_SYMBOLS: readonly string[] = ["_", "~", ...CHARACTER_SYMBOLS];

export const PAD_ID = 0;
export const EOS_ID = 1;

// ---- vocoder (vocoder/hparams.py, models/fatchord_version.py) -------------

/** RAW mode, 9 bits → 512 classes, mu-law decode on output. */
export const VOC_BITS = 9;
export const VOC_CLASSES = 2 ** VOC_BITS; // 512
export const VOC_UPSAMPLE_FACTORS = [5, 5, 8] as const;
/** Upsample product — samples of audio per mel frame. */
export const VOC_TOTAL_SCALE = 200;
export const VOC_AUX_DIMS = 32; // res_out 128 / 4 slices
export const VOC_RNN_DIMS = 512;
/** De-emphasis IIR coefficient (inverse of the synth-side pre-emphasis). */
export const VOC_DEEMPHASIS = 0.97;

/**
 * Chunked shipping form: one mel frame per `voice-voc-chunk` run — 200
 * unrolled WaveRNN steps with per-sample conditioning rows and in-graph
 * gumbel-max sampling. JS seeds `u ~ Uniform[0, 1)` per sample; u = 0.5 gives
 * the deterministic argmax path used by fixtures.
 */
export const VOC_CHUNK_SAMPLES = VOC_TOTAL_SCALE;

/**
 * Deterministic speaker embedding used ONLY by the parity fixtures — both the
 * Python fixture generator and the TS verifier derive it from this formula, so
 * no random state crosses the boundary. Not used at runtime.
 */
export function fixtureSpeakerEmbedding(): Float32Array {
  const raw = new Float32Array(SPEAKER_EMBEDDING_SIZE);
  for (let i = 0; i < SPEAKER_EMBEDDING_SIZE; i++) {
    raw[i] = Math.sin((i + 1) * 0.1237) + Math.cos(i * 0.031);
  }
  let norm = 0;
  for (const v of raw) norm += v * v;
  norm = Math.sqrt(norm);
  for (let i = 0; i < raw.length; i++) raw[i] /= norm;
  return raw;
}

/**
 * Seeded uniform PRNG (mulberry32) for synthesis sampling — deterministic per
 * session seed so a given (voice, text, seed) always yields the same audio.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- graph I/O contracts (name order matters only for readability; feeds
// are by name) ---------------------------------------------------------------

/** Graph input name sets — kept as literals so a renamed graph input fails
 * loudly at the contract level instead of silently at run time. */
export const GRAPH_INPUTS = {
  encoder: ["mel_partial"] as const,
  synthEncode: ["text", "spk_embed"] as const,
  synthStep: [
    "enc_seq",
    "enc_seq_proj",
    "chars",
    "prenet_in",
    "attn_h",
    "rnn1_h",
    "rnn2_h",
    "rnn1_c",
    "rnn2_c",
    "context",
    "cumulative",
  ] as const,
  vocUpsample: ["mel"] as const,
  vocStep: ["x_prev", "m_t", "a1", "a2", "a3", "a4", "h1", "h2"] as const,
  vocChunk: ["x_prev", "mels", "aux", "h1", "h2", "u"] as const,
};

/** Synth-step loop-carried states: graph output `next_<name>` feeds the next
 * run's input `<name>`. */
export const SYNTH_STATE_NAMES = [
  "attn_h",
  "rnn1_h",
  "rnn2_h",
  "rnn1_c",
  "rnn2_c",
  "context",
  "cumulative",
] as const;

export type SynthStateName = (typeof SYNTH_STATE_NAMES)[number];