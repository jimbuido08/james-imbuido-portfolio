/**
 * The storyteller's generation state machine — the trainState/genState pattern
 * from the LLM Lab, minus training: phases for load → work → done/error, a
 * two-step armed cancel (a stray click can't kill a story), and human status
 * copy for the aria-live line.
 */

export type StorytellerPhase =
  "idle" | "loading" | "working" | "done" | "error";

export interface StorytellerState {
  phase: StorytellerPhase;
  text: string;
  tokens: number;
  stopped: boolean;
  cancelArmed: boolean;
  errorMessage: string | null;
}

export type StorytellerAction =
  | { type: "loadStart" }
  | { type: "genStart" }
  | { type: "chunk"; text: string; tokens: number }
  | { type: "genDone"; tokens: number }
  | { type: "genCancelled"; tokens: number }
  | { type: "error"; message: string }
  | { type: "armCancel" }
  | { type: "disarmCancel" };

export const initialStorytellerState: StorytellerState = {
  phase: "idle",
  text: "",
  tokens: 0,
  stopped: false,
  cancelArmed: false,
  errorMessage: null,
};

export function storytellerReducer(
  state: StorytellerState,
  action: StorytellerAction,
): StorytellerState {
  switch (action.type) {
    case "loadStart":
      return { ...state, phase: "loading", cancelArmed: false };
    case "genStart":
      return { ...initialStorytellerState, phase: "working" };
    case "chunk":
      return {
        ...state,
        text: state.text + action.text,
        tokens: action.tokens,
      };
    case "genDone":
      return {
        ...state,
        phase: "done",
        tokens: action.tokens,
        stopped: false,
        cancelArmed: false,
      };
    case "genCancelled":
      return {
        ...state,
        phase: "done",
        tokens: action.tokens,
        stopped: true,
        cancelArmed: false,
      };
    case "error":
      return {
        ...state,
        phase: "error",
        errorMessage: action.message,
        cancelArmed: false,
      };
    case "armCancel":
      return { ...state, cancelArmed: true };
    case "disarmCancel":
      return { ...state, cancelArmed: false };
  }
}

/** The aria-live status line (human copy, no jargon). */
export function storytellerStatusCopy(state: StorytellerState): string {
  switch (state.phase) {
    case "loading":
      return "Loading the model — 13.8 MB, one time…";
    case "working":
      return state.cancelArmed
        ? "Writing — confirm to stop."
        : `Writing… ${state.tokens} tokens.`;
    case "done":
      return state.stopped
        ? `Stopped — ${state.tokens} tokens. The partial story stays.`
        : `Done — ${state.tokens} tokens.`;
    case "error":
      return state.errorMessage ?? "Something went wrong.";
    case "idle":
      return "";
  }
}
