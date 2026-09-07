/**
 * TS port of `encoder/inference.py::compute_partial_slices` — where to split a
 * waveform's mel spectrogram into 160-frame partial utterances with 50 %
 * overlap, dropping a tail partial whose real-frame coverage is below 75 %
 * (mirrors `ENCODER_MIN_PAD_COVERAGE`). The mel slices may index past the
 * mel's frame count: callers zero-pad short partials, exactly like the
 * fixture generator's embed_cases.
 */
import {
  ENCODER_HOP,
  ENCODER_MIN_PAD_COVERAGE,
  ENCODER_PARTIAL_FRAMES,
} from "./modelContract";

export interface PartialSlices {
  /** Frame ranges [start, stop) per partial utterance. */
  melSlices: Array<{ start: number; stop: number }>;
}

export function computePartialSlices(nSamples: number): PartialSlices {
  const samplesPerFrame = ENCODER_HOP; // 10 ms at 16 kHz
  const nFrames = Math.ceil((nSamples + 1) / samplesPerFrame);
  const frameStep = Math.max(
    Math.round(ENCODER_PARTIAL_FRAMES * (1 - 0.5)),
    1,
  );

  const melSlices: Array<{ start: number; stop: number }> = [];
  const steps = Math.max(
    1,
    nFrames - ENCODER_PARTIAL_FRAMES + frameStep + 1,
  );
  for (let i = 0; i < steps; i += frameStep) {
    melSlices.push({ start: i, stop: i + ENCODER_PARTIAL_FRAMES });
  }

  const last = melSlices[melSlices.length - 1];
  const coverage = (nSamples - last.start * samplesPerFrame) /
    ((last.stop - last.start) * samplesPerFrame);
  if (coverage < ENCODER_MIN_PAD_COVERAGE && melSlices.length > 1) {
    melSlices.pop();
  }
  return { melSlices };
}