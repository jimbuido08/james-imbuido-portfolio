/**
 * Training state machine for /llm-lab (the recordState.ts/synthState.ts
 * pattern): phases, copy tables, and the two-step-armed Cancel (mirrors the
 * chess resign arm — a stray click can't kill a run). Partial models are
 * first-class: a cancelled run still leaves a usable model in the worker.
 */
import type { ProgressMessage } from "../../workers/llm.worker";

export type TrainPhase =
  | "idle" // never trained on this page load
  | "working" // worker mid-run
  | "cancelling" // cancel posted; worker finishes the current step
  | "done"
  | "cancelled"
  | "error";

export interface LossPoint {
  step: number;
  lossEma: number;
}

export interface TrainState {
  phase: TrainPhase;
  step: number;
  totalSteps: number;
  lossEma: number;
  tokensPerSec: number;
  etaSeconds: number;
  /** Latest mid-training sample text (fixed eval seed, so progress is visible). */
  sample: string | null;
  history: LossPoint[];
  cancelArmed: boolean;
  finalLoss: number | null;
  elapsedMs: number | null;
  error: string | null;
}

export function initialTrainState(): TrainState {
  return {
    phase: "idle",
    step: 0,
    totalSteps: 0,
    lossEma: NaN,
    tokensPerSec: 0,
    etaSeconds: 0,
    sample: null,
    history: [],
    cancelArmed: false,
    finalLoss: null,
    elapsedMs: null,
    error: null,
  };
}

export type TrainAction =
  | { type: "start"; totalSteps: number }
  | { type: "progress"; progress: ProgressMessage }
  | { type: "armCancel" }
  | { type: "disarmCancel" }
  | { type: "cancelling" }
  | { type: "cancelled"; atStep: number; lossEma: number }
  | { type: "done"; finalLoss: number; elapsedMs: number }
  | { type: "error"; message: string }
  | { type: "reset" };

const MAX_HISTORY = 1024;

export function trainReducer(
  state: TrainState,
  action: TrainAction,
): TrainState {
  switch (action.type) {
    case "start":
      return {
        ...initialTrainState(),
        phase: "working",
        totalSteps: action.totalSteps,
      };
    case "progress": {
      const p = action.progress;
      const history =
        state.history.length >= MAX_HISTORY
          ? state.history
          : [...state.history, { step: p.step, lossEma: p.lossEma }];
      return {
        ...state,
        step: p.step,
        lossEma: p.lossEma,
        tokensPerSec: p.tokensPerSec,
        etaSeconds: p.etaSeconds,
        sample: p.sample ?? state.sample,
        history,
      };
    }
    case "armCancel":
      return state.phase === "working"
        ? { ...state, cancelArmed: true }
        : state;
    case "disarmCancel":
      return { ...state, cancelArmed: false };
    case "cancelling":
      return state.phase === "working"
        ? { ...state, phase: "cancelling", cancelArmed: false }
        : state;
    case "cancelled":
      return {
        ...state,
        phase: "cancelled",
        step: action.atStep,
        lossEma: action.lossEma,
        cancelArmed: false,
      };
    case "done":
      return {
        ...state,
        phase: "done",
        finalLoss: action.finalLoss,
        elapsedMs: action.elapsedMs,
        cancelArmed: false,
      };
    case "error":
      return {
        ...state,
        phase: "error",
        error: action.message,
        cancelArmed: false,
      };
    case "reset":
      return initialTrainState();
  }
}

/** The aria-live status line under the Train card. */
export function trainStatusCopy(state: TrainState): string {
  switch (state.phase) {
    case "idle":
      return "Ready when you are — nothing has been trained yet.";
    case "working": {
      const loss = Number.isFinite(state.lossEma)
        ? `${state.lossEma.toFixed(3)} nats`
        : "…";
      const eta =
        state.etaSeconds > 0
          ? ` · ~${Math.max(1, Math.round(state.etaSeconds))} s left`
          : "";
      const tps =
        state.tokensPerSec > 0
          ? ` · ${Math.round(state.tokensPerSec).toLocaleString()} tok/s`
          : "";
      return `Step ${state.step}/${state.totalSteps} · loss ${loss}${tps}${eta}`;
    }
    case "cancelling":
      return "Stopping after the current step…";
    case "done": {
      const secs = state.elapsedMs
        ? ` in ${(state.elapsedMs / 1000).toFixed(0)} s`
        : "";
      return `Trained ${state.totalSteps} steps${secs} — final loss ${state.finalLoss?.toFixed(3) ?? "…"}.`;
    }
    case "cancelled":
      return `Stopped at step ${state.step} — the partially-trained model is still usable.`;
    case "error":
      return state.error ?? "Training failed.";
  }
}

export function canStart(phase: TrainPhase): boolean {
  return phase !== "working" && phase !== "cancelling";
}

export function canCancel(state: TrainState): boolean {
  return state.phase === "working";
}

/** Sparkline data — the plain loss history in chart-ready form. */
export function sparklinePoints(
  history: LossPoint[],
  width: number,
  height: number,
  pad = 4,
): string {
  if (history.length < 2) return "";
  const losses = history.map((h) => h.lossEma);
  const max = Math.max(...losses);
  const min = Math.min(...losses);
  const spanX = history[history.length - 1].step - history[0].step || 1;
  const spanY = max - min || 1;
  return history
    .map((h) => {
      const x = pad + ((h.step - history[0].step) / spanX) * (width - 2 * pad);
      const y = pad + (1 - (h.lossEma - min) / spanY) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
