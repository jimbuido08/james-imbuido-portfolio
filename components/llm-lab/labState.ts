/**
 * Workflow state for /llm-lab — corpus choice, config, and model provenance,
 * shared by the five step cards. Mirrored after the voice/chess state modules:
 * exported reducer + guards so LlmLab.tsx stays declarative.
 *
 * Content integrity: the bundled corpora are generated artifacts
 * (lib/llm/bundledCorpus.ts, portfolioCorpus.ts — see make_corpora.py); the
 * paste/URL text a visitor enters never leaves their tab.
 */
import { PRESETS, calibrationToSteps } from "../../lib/llm/config";
import type { PresetKey } from "../../lib/llm/config";
import { encodeBytes } from "../../lib/llm/tokenizer";
import { BUNDLED_CORPUS } from "../../lib/llm/bundledCorpus";
import { PORTFOLIO_CORPUS } from "../../lib/llm/portfolioCorpus";

export type CorpusKey = "bundled" | "portfolio" | "paste" | "url";
export type ModelProvenance = "none" | "trained" | "sample" | "upload";

/** Paste/URL corpus bounds — the worker rejects shorter than ctx+2 anyway. */
export const MIN_CORPUS_BYTES = 512;
export const MAX_CORPUS_BYTES = 512 * 1024;

export type UrlPhase = "empty" | "loading" | "ready" | "error";

export interface LabState {
  corpusKey: CorpusKey;
  pasteText: string;
  urlText: string;
  urlPhase: UrlPhase;
  urlError: string | null;
  presetKey: PresetKey;
  /** True once the visitor picks a preset — device-env detection won't override it. */
  presetTouched: boolean;
  steps: number;
  /** True once the visitor edits the steps input — calibration won't overwrite. */
  stepsTouched: boolean;
  seed: number;
  provenance: ModelProvenance;
  /** Measured device matmul rate once the worker init lands (undefined until). */
  measuredGflops: number | null;
}

export type LabEnv = {
  coarsePointer: boolean;
  smallScreen: boolean;
  saveData: boolean;
  reducedMotion: boolean;
};

/** Phones and data-saver connections start on the fastest preset. */
export function pickDefaultPreset(env: LabEnv): PresetKey {
  return env.coarsePointer || env.smallScreen || env.saveData
    ? "nano"
    : "small";
}

export const DEFAULT_LAB_ENV: LabEnv = {
  coarsePointer: false,
  smallScreen: false,
  saveData: false,
  reducedMotion: false,
};

/**
 * The interactive tree mounts only after hydration (the LlmLab mount gate), so
 * this initializer reads the REAL device environment synchronously on the
 * client — no server/client render divergence, no post-mount correction.
 */
export function initialLabState(env: LabEnv): LabState {
  const presetKey = pickDefaultPreset(env);
  return {
    corpusKey: "bundled",
    pasteText: "",
    urlText: "",
    urlPhase: "empty",
    urlError: null,
    presetKey,
    presetTouched: false,
    steps: PRESETS[presetKey].defaultSteps,
    stepsTouched: false,
    seed: 1,
    provenance: "none",
    measuredGflops: null,
  };
}

export type LabAction =
  | { type: "selectCorpus"; key: CorpusKey }
  | { type: "setPaste"; text: string }
  | { type: "urlFetchStart" }
  | { type: "urlFetchOk"; text: string }
  | { type: "urlFetchError"; message: string }
  | { type: "setPreset"; key: PresetKey }
  | { type: "setSteps"; steps: number }
  | { type: "setSeed"; seed: number }
  | { type: "calibrated"; measuredGflops: number }
  | { type: "setProvenance"; provenance: ModelProvenance };

export function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case "selectCorpus":
      return { ...state, corpusKey: action.key };
    case "setPaste":
      return { ...state, pasteText: action.text };
    case "urlFetchStart":
      return { ...state, urlPhase: "loading", urlError: null };
    case "urlFetchOk":
      return {
        ...state,
        urlPhase: "ready",
        urlText: action.text,
        urlError: null,
      };
    case "urlFetchError":
      return { ...state, urlPhase: "error", urlError: action.message };
    case "setPreset":
      return {
        ...state,
        presetKey: action.key,
        presetTouched: true,
        steps: state.measuredGflops
          ? calibrationToSteps(state.measuredGflops, PRESETS[action.key])
          : PRESETS[action.key].defaultSteps,
        stepsTouched: false,
      };
    case "setSteps":
      return { ...state, steps: action.steps, stepsTouched: true };
    case "setSeed":
      return { ...state, seed: action.seed };
    case "calibrated": {
      const measuredGflops = action.measuredGflops;
      return {
        ...state,
        measuredGflops,
        steps: state.stepsTouched
          ? state.steps
          : calibrationToSteps(measuredGflops, PRESETS[state.presetKey]),
      };
    }
    case "setProvenance":
      return { ...state, provenance: action.provenance };
  }
}

/** The text the model will train on for the current corpus selection. */
export function resolveCorpusText(state: LabState): string {
  switch (state.corpusKey) {
    case "bundled":
      return BUNDLED_CORPUS;
    case "portfolio":
      return PORTFOLIO_CORPUS;
    case "paste":
      return state.pasteText;
    case "url":
      return state.urlText;
  }
}

/** Byte length of the current corpus (bytes are the tokens — vocab 256). */
export function corpusByteCount(state: LabState): number {
  return encodeBytes(resolveCorpusText(state)).length;
}

/** Human-readable validation error for the current corpus, or null if usable. */
export function corpusProblem(state: LabState): string | null {
  if (state.corpusKey === "url" && state.urlPhase !== "ready") {
    return state.urlPhase === "loading"
      ? null // loading is valid-but-waiting; the guard separately blocks it
      : "Fetch a URL's text first.";
  }
  const bytes = corpusByteCount(state);
  if (bytes < MIN_CORPUS_BYTES)
    return `Need at least ${MIN_CORPUS_BYTES} bytes of text (about a paragraph) — currently ${bytes}.`;
  if (bytes > MAX_CORPUS_BYTES)
    return `That's over ${Math.round(MAX_CORPUS_BYTES / 1024)} KB — use a shorter excerpt.`;
  const minBytes = PRESETS[state.presetKey].config.ctxLen + 2;
  if (bytes < minBytes)
    return `The ${PRESETS[state.presetKey].label} preset needs at least ${minBytes} bytes.`;
  return null;
}

export function canStartTrain(state: LabState, trainPhase: string): boolean {
  if (trainPhase === "working" || trainPhase === "cancelling") return false;
  if (state.corpusKey === "url" && state.urlPhase === "loading") return false;
  return corpusProblem(state) === null;
}

export function canGenerate(state: LabState): boolean {
  return state.provenance !== "none";
}

/** Label for the loaded model, used across the Generate/Model cards. */
export function provenanceLabel(p: ModelProvenance): string {
  switch (p) {
    case "none":
      return "no model yet";
    case "trained":
      return "your trained model";
    case "sample":
      return "the sample model";
    case "upload":
      return "the uploaded model";
  }
}
