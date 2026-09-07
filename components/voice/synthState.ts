/**
 * Synthesis state machine for /voice (text → audio), mirroring
 * components/chess/gameState.ts. Phases map 1:1 onto the worker's stage
 * messages so VoiceStudio only renders state, never protocol details.
 */
import type { EngineStage, EngineProgress } from "../../lib/voice/engine";

export type SynthPhase =
  | "idle"
  | "working"
  | "done"
  | "error";

export interface SynthState {
  phase: SynthPhase;
  /** Latest worker stage (only meaningful while working). */
  stage?: EngineStage;
  current?: number;
  total?: number;
  error?: string;
}

export function initialSynthState(): SynthState {
  return { phase: "idle" };
}

export type SynthAction =
  | { type: "start" }
  | { type: "progress"; progress: EngineProgress }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "reset" };

export function synthReducer(state: SynthState, action: SynthAction): SynthState {
  switch (action.type) {
    case "start":
      return { phase: "working" };
    case "progress":
      return {
        phase: "working",
        stage: action.progress.stage,
        current: action.progress.current,
        total: action.progress.total,
      };
    case "done":
      return { phase: "done" };
    case "error":
      return { phase: "error", error: action.message };
    case "reset":
      return initialSynthState();
  }
}

/** Sentence for the current stage — shown while the worker runs. */
export function synthStageCopy(state: SynthState): string {
  switch (state.stage) {
    case "loading":
      return "Loading models… (first run downloads ~111 MB, cached afterwards)";
    case "encoder":
      return "Computing the mel spectrogram…";
    case "text-encode":
      return "Encoding text…";
    case "decode": {
      const done = state.total ? Math.round(((state.current ?? 0) / state.total) * 100) : null;
      return done === null ? "Decoding the spectrogram…" : `Decoding the spectrogram… ${done}%`;
    }
    case "vocode": {
      const done = state.total ? Math.round(((state.current ?? 0) / state.total) * 100) : null;
      return done === null ? "Generating audio…" : `Generating audio… ${done}%`;
    }
    default:
      return "Working…";
  }
}

export function canStartSynthesis(state: SynthState): boolean {
  return state.phase === "idle" || state.phase === "done" || state.phase === "error";
}