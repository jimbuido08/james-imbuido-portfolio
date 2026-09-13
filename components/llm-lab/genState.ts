/**
 * Generation state for /llm-lab (synthState.ts pattern): prompt/temperature/
 * length inputs plus the streamed output text. The worker streams byte chunks;
 * the component appends decoded text per chunk.
 */
import type { ModelProvenance } from "./labState";

export type GenPhase = "idle" | "working" | "done" | "error";

export interface GenState {
  phase: GenPhase;
  prompt: string;
  temperature: number;
  maxTokens: number;
  seed: number;
  text: string;
  error: string | null;
}

export const MIN_TEMPERATURE = 0.5;
export const MAX_TEMPERATURE = 1.2;
export const MIN_GEN_TOKENS = 16;
export const MAX_GEN_TOKENS = 256;

export function initialGenState(): GenState {
  return {
    phase: "idle",
    prompt: "",
    temperature: 0.8,
    maxTokens: 96,
    seed: 7,
    text: "",
    error: null,
  };
}

export type GenAction =
  | { type: "setPrompt"; prompt: string }
  | { type: "setTemperature"; temperature: number }
  | { type: "setMaxTokens"; maxTokens: number }
  | { type: "start" }
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "regenerate" }; // same settings, next seed

export function genReducer(state: GenState, action: GenAction): GenState {
  switch (action.type) {
    case "setPrompt":
      return { ...state, prompt: action.prompt };
    case "setTemperature":
      return { ...state, temperature: action.temperature };
    case "setMaxTokens":
      return { ...state, maxTokens: action.maxTokens };
    case "start":
      return { ...state, phase: "working", text: "", error: null };
    case "chunk":
      return { ...state, text: state.text + action.text };
    case "done":
      return { ...state, phase: "done" };
    case "error":
      return { ...state, phase: "error", error: action.message };
    case "regenerate":
      return { ...state, seed: state.seed + 1 };
  }
}

export function canGenerateNow(
  state: GenState,
  provenance: ModelProvenance,
): boolean {
  return state.phase !== "working" && provenance !== "none";
}

export function genStatusCopy(
  state: GenState,
  provenance: ModelProvenance,
): string {
  if (provenance === "none") return "Train a model or load the sample first.";
  switch (state.phase) {
    case "idle":
      return "Ready to sample from the loaded model.";
    case "working":
      return `Generating ${state.text.length} characters so far…`;
    case "done":
      return `Generated ${state.text.length} characters at temperature ${state.temperature}.`;
    case "error":
      return state.error ?? "Generation failed.";
  }
}
