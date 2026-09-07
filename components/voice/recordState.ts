/**
 * Recording state machine for /voice — mirrors components/chess/gameState.ts:
 * exported transitions so the component stays declarative. The encoder needs
 * at least one 160-frame partial (~1.6 s), so short recordings are rejected
 * with a message, not a silent failure. Consent copy: recording never leaves
 * the device — the worker keeps the mel/embedding pipeline local.
 */

export const MIN_RECORD_SECONDS = 2;
/** Keeps synthesis cost bounded (max utterance ≈ 30 s of speech is far past
 * the ~10-word budget the gate measured; the UI caps the take). */
export const MAX_RECORD_SECONDS = 30;

export type RecordPhase =
  | "idle" // no permission asked yet
  | "requesting" // getUserMedia in flight
  | "recording" // worklet streaming samples
  | "processing" // stopping, resampling to 16 kHz
  | "error";

export interface RecordState {
  phase: RecordPhase;
  /** Recorded seconds so far (updates as worklet batches arrive). */
  seconds: number;
  error?: string;
}

export function initialRecordState(): RecordState {
  return { phase: "idle", seconds: 0 };
}

export type RecordAction =
  | { type: "request" }
  | { type: "granted" }
  | { type: "tick"; seconds: number }
  | { type: "processing" }
  | { type: "error"; message: string }
  | { type: "reset" };

export function recordReducer(state: RecordState, action: RecordAction): RecordState {
  switch (action.type) {
    case "request":
      return { phase: "requesting", seconds: 0 };
    case "granted":
      return { phase: "recording", seconds: 0 };
    case "tick":
      return { ...state, seconds: action.seconds };
    case "processing":
      return { ...state, phase: "processing" };
    case "error":
      return { phase: "error", seconds: 0, error: action.message };
    case "reset":
      return initialRecordState();
  }
}

export const RECORD_PHASE_COPY: Record<RecordPhase, string> = {
  idle: "Recording never leaves your device — audio is processed entirely in this browser tab.",
  requesting: "Waiting for microphone permission…",
  recording: "Recording… speak naturally for a few seconds.",
  processing: "Finishing the take and resampling…",
  error: "",
};

/** Copy under the record button for the current state (empty = none). */
export function recordHint(state: RecordState): string {
  if (state.phase === "error") return state.error ?? "";
  if (
    state.phase === "recording" &&
    state.seconds < MIN_RECORD_SECONDS
  ) {
    return `Keep going — the voice encoder needs at least ${MIN_RECORD_SECONDS} s.`;
  }
  return RECORD_PHASE_COPY[state.phase];
}

export function canStartRecording(state: RecordState): boolean {
  return state.phase === "idle" || state.phase === "error";
}

export function canStopRecording(state: RecordState): boolean {
  return (
    state.phase === "recording" && state.seconds >= MIN_RECORD_SECONDS
  );
}