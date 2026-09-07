/**
 * TS port of the two mel-spectrogram paths (mirrors `training/voice/mel_ref.py`,
 * which follows the reference repo's `encoder/audio.py` and
 * `synthesizer/audio.py` against librosa 1.0.0):
 *
 * - encoder mel — power mel: sr 16000, n_fft 400, hop 160, 40 bins, librosa
 *   defaults (fmin 0, fmax 8000, Slaney scale + norm, power 2), no log, no
 *   normalisation. Returns (T, 40) — the encoder graph's channel-major input
 *   layout is applied at the call site.
 * - synth mel — pre-emphasis 0.97, STFT (800, hop 200, win 800), 80-bin mel
 *   (fmin 55, fmax 7600) over the MAGNITUDE, dB (min −100 / ref 20), symmetric
 *   ±4 normalisation. Returns (T, 80).
 *
 * librosa 1.0.0 STFT facts mirrored here (verified empirically against the
 * installed version): center=True with `pad_mode = "constant"` (zero padding
 * of n_fft/2 on both sides — librosa 1.0's default, NOT the reflect padding of
 * older releases), periodic Hann window (scipy `sym=False`), rfft bins =
 * n_fft/2 + 1 evaluated at the exact n_fft bin grid — a power-of-two
 * zero-padded FFT would interpolate at the wrong frequencies (k·sr/512 vs the
 * required k·sr/400), so the transform is an exact precomputed-table DFT (see
 * the note at `dftTables`). Parity with the Python reference is proven by the
 * golden fixtures (`npm run verify:voice-model`).
 */
import {
  ENCODER_HOP,
  ENCODER_MELS,
  ENCODER_N_FFT,
  SYNTH_FMAX,
  SYNTH_FMIN,
  SYNTH_HOP,
  SYNTH_MAX_ABS_VALUE,
  SYNTH_MELS,
  SYNTH_MIN_LEVEL_DB,
  SYNTH_N_FFT,
  SYNTH_PREEMPHASIS,
  SYNTH_REF_LEVEL_DB,
} from "./modelContract";

// ---- DFT (exact bin grid — see note below) ---------------------------------

/**
 * Precomputed DFT tables for an n_fft-sized real transform, bins 0..n_fft/2.
 *
 * Why not a radix-2 FFT over the next power of two: zero-padding a 400-sample
 * frame to 512 points evaluates the spectrum at k·sr/512 (31.25 Hz spacing),
 * NOT at the 400-point DFT's k·sr/400 (40 Hz) — the bins that librosa's STFT
 * produces. Interpolating between them is not exact, so the transform runs at
 * the exact n_fft grid: an O(n_fft²) direct DFT with precomputed twiddle
 * tables. At these sizes (400/800) the cost is milliseconds per frame in JS
 * and the mel is computed once per recording/synthesis.
 */
interface DftTables {
  readonly nFft: number;
  readonly bins: number;
  /** cos(−2πkn/n_fft) and sin(−2πkn/n_fft), row-major [k · nFft + n]. */
  readonly cos: Float64Array;
  readonly sin: Float64Array;
}

const dftTableCache = new Map<number, DftTables>();

export function dftTables(nFft: number): DftTables {
  const cached = dftTableCache.get(nFft);
  if (cached) return cached;
  const bins = Math.floor(nFft / 2) + 1;
  const cos = new Float64Array(bins * nFft);
  const sin = new Float64Array(bins * nFft);
  for (let k = 0; k < bins; k++) {
    const angle = (-2 * Math.PI * k) / nFft;
    for (let n = 0; n < nFft; n++) {
      cos[k * nFft + n] = Math.cos(angle * n);
      sin[k * nFft + n] = Math.sin(angle * n);
    }
  }
  const tables = { nFft, bins, cos, sin };
  dftTableCache.set(nFft, tables);
  return tables;
}

/** Magnitude spectrum (n_fft/2 + 1 bins) of one windowed frame. */
function frameMagnitude(frame: Float32Array, tables: DftTables): Float32Array {
  const { nFft, bins, cos, sin } = tables;
  const mag = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    let re = 0;
    let im = 0;
    const cRow = k * nFft;
    const sRow = k * nFft;
    for (let n = 0; n < nFft; n++) {
      const x = frame[n];
      re += x * cos[cRow + n];
      im += x * sin[sRow + n];
    }
    mag[k] = Math.hypot(re, im); // |Σ x·e^{−iθ}| — im carries the minus sign
  }
  return mag;
}

// ---- windowing / framing (librosa.stft semantics) ---------------------------

/** Periodic Hann (scipy `sym=False`, librosa's default window). */
function hannPeriodic(length: number): Float32Array {
  const w = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / length);
  }
  return w;
}

/**
 * One STFT magnitude column per hop — the shared framing core (center=True,
 * zero-pad n_fft/2 both sides, win_length == n_fft). Returns frames × bins.
 */
export function stftMagnitudes(
  y: Float32Array,
  nFft: number,
  hop: number,
): Float32Array[] {
  const pad = Math.floor(nFft / 2);
  const paddedLen = y.length + 2 * pad;
  const padded = new Float32Array(paddedLen);
  padded.set(y, pad);

  const window = hannPeriodic(nFft);
  const tables = dftTables(nFft);
  const nFrames = 1 + Math.floor((paddedLen - nFft) / hop);
  const frames: Float32Array[] = [];
  const windowed = new Float32Array(nFft);
  for (let t = 0; t < nFrames; t++) {
    const offset = t * hop;
    for (let i = 0; i < nFft; i++) {
      windowed[i] = padded[offset + i] * window[i];
    }
    frames.push(frameMagnitude(windowed, tables));
  }
  return frames;
}

// ---- Slaney mel filterbank (librosa.filters.mel defaults) -------------------

function hzToMelSlaney(f: number): number {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logstep = Math.log(6.4) / 27;
  if (f < minLogHz) return f / fSp;
  return minLogMel + Math.log(f / minLogHz) / logstep;
}

function melToHzSlaney(mel: number): number {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logstep = Math.log(6.4) / 27;
  if (mel < minLogMel) return fSp * mel;
  return minLogHz * Math.exp(logstep * (mel - minLogMel));
}

/** librosa.filters.mel(sr, n_fft, n_mels, fmin, fmax) — htk=False, norm='slaney'. */
export function melFilterbank(
  sr: number,
  nFft: number,
  nMels: number,
  fmin: number,
  fmax: number,
): Float32Array[] {
  const bins = Math.floor(nFft / 2) + 1;
  const melMin = hzToMelSlaney(fmin);
  const melMax = hzToMelSlaney(fmax);
  // mel_f: nMels + 2 edge frequencies, linear in mel space.
  const melPoints = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPoints[i] = melToHzSlaney(melMin + ((melMax - melMin) * i) / (nMels + 1));
  }
  // fft frequencies: sr/2 * linspace(0, 1, bins).
  const fftFreqs = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    fftFreqs[k] = ((sr / 2) * k) / (bins - 1);
  }
  const basis: Float32Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const lower = melPoints[m];
    const upper = melPoints[m + 2];
    const fdiffLower = melPoints[m + 1] - lower;
    const fdiffUpper = upper - melPoints[m + 1];
    const filter = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      const f = fftFreqs[k];
      if (f < lower || f > upper) continue;
      // librosa: min of the rising and falling slopes of the triangle.
      const upslope = (f - lower) / fdiffLower;
      const downslope = (upper - f) / fdiffUpper;
      filter[k] = Math.max(0, Math.min(upslope, downslope));
    }
    // Slaney norm: scale each triangle to constant per-mel area.
    const enorm = 2 / (melPoints[m + 2] - melPoints[m]);
    for (let k = 0; k < bins; k++) filter[k] *= enorm;
    basis.push(filter);
  }
  return basis;
}

/**
 * Filterbank dot: mel[t][b] = Σ_k basis[b][k] · spec[t][k]^power.
 * Frames-major: frame t is an array of nMels values — the (T, bins) layout.
 */
function applyBasis(
  basis: Float32Array[],
  mags: Float32Array[],
  power: number,
): Float32Array[] {
  const out = mags.map(() => new Float32Array(basis.length));
  for (let b = 0; b < basis.length; b++) {
    const filter = basis[b];
    for (let t = 0; t < mags.length; t++) {
      const mag = mags[t];
      let sum = 0;
      for (let k = 0; k < filter.length; k++) {
        const v = filter[k];
        if (v !== 0) sum += v * Math.pow(mag[k], power);
      }
      out[t][b] = sum;
    }
  }
  return out;
}

// ---- public paths -----------------------------------------------------------

/**
 * `encoder.audio.wav_to_mel_spectrogram` — (T, 40) power mel, float32.
 * Time-major: frame t is row t; the encoder graph wants channel-major
 * [1, 40, 160] partials, sliced by the caller.
 */
export function encoderMel(wav: Float32Array): Float32Array[] {
  const basis = melFilterbank(16000, ENCODER_N_FFT, ENCODER_MELS, 0, 8000);
  const mags = stftMagnitudes(wav, ENCODER_N_FFT, ENCODER_HOP);
  return applyBasis(basis, mags, 2); // power mel
}

/**
 * `synthesizer.audio.melspectrogram` — (T, 80) pre-emphasised, dB,
 * ±4-normalised mel over the magnitude. The model-side mel; the vocoder
 * consumes these values divided by 4.
 */
export function synthMel(wav: Float32Array): Float32Array[] {
  // pre-emphasis: lfilter([1, -0.97], [1], y) → y'[0]=y[0], y'[n]=y[n]−0.97y[n−1]
  const preemphasised = new Float32Array(wav.length);
  preemphasised[0] = wav[0];
  for (let n = 1; n < wav.length; n++) {
    preemphasised[n] = wav[n] - SYNTH_PREEMPHASIS * wav[n - 1];
  }
  const mags = stftMagnitudes(preemphasised, SYNTH_N_FFT, SYNTH_HOP);
  const basis = melFilterbank(16000, SYNTH_N_FFT, SYNTH_MELS, SYNTH_FMIN, SYNTH_FMAX);
  const mel = applyBasis(basis, mags, 1); // magnitude, not power
  const minLevel = Math.exp((SYNTH_MIN_LEVEL_DB / 20) * Math.log(10));
  return mel.map((frames) => {
    const out = new Float32Array(frames.length);
    for (let t = 0; t < frames.length; t++) {
      const db = 20 * Math.log10(Math.max(minLevel, frames[t])) - SYNTH_REF_LEVEL_DB;
      const clipped = (2 * SYNTH_MAX_ABS_VALUE) *
        ((db - SYNTH_MIN_LEVEL_DB) / -SYNTH_MIN_LEVEL_DB) -
        SYNTH_MAX_ABS_VALUE;
      out[t] = Math.min(SYNTH_MAX_ABS_VALUE, Math.max(-SYNTH_MAX_ABS_VALUE, clipped));
    }
    return out;
  });
}

/**
 * `synthesizer.audio._denormalize` — inverse of the ±4 normalisation, needed
 * by the Griffin-Lim fallback (and any dB-side debug view).
 */
export function synthDenormalize(bins: Float32Array[]): Float32Array[] {
  return bins.map((frames) => {
    const out = new Float32Array(frames.length);
    for (let t = 0; t < frames.length; t++) {
      const v = Math.min(
        SYNTH_MAX_ABS_VALUE,
        Math.max(-SYNTH_MAX_ABS_VALUE, frames[t]),
      );
      out[t] =
        ((v + SYNTH_MAX_ABS_VALUE) * -SYNTH_MIN_LEVEL_DB) /
          (2 * SYNTH_MAX_ABS_VALUE) +
        SYNTH_MIN_LEVEL_DB;
    }
    return out;
  });
}