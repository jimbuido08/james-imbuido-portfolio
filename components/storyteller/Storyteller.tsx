"use client";

/**
 * The storyteller's interactive card. Mounted-gated: pre-hydration and
 * no-JS visitors get the static explainer (the LLM Lab precedent); after
 * mount, the worker-powered studio takes over. The model preloads on the
 * first prompt interaction (Data Saver respected) so Generate feels instant.
 */

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { MonoKicker } from "@/components/ui/MonoKicker";
import { chatFieldClasses, fieldClasses } from "@/components/ui/fieldClasses";
import {
  GEN_DEFAULT_TEMPERATURE,
  GEN_DEFAULT_TOKENS,
  GEN_MAX_TEMPERATURE,
  GEN_MAX_TOKENS,
  GEN_MIN_TEMPERATURE,
  GEN_MIN_TOKENS,
} from "@/lib/storyteller/config";
import {
  ensureStorytellerLoaded,
  requestCancelGenerate,
  requestGenerate,
  requestInit,
  requestPreload,
} from "./storytellerClient";
import {
  initialStorytellerState,
  storytellerReducer,
  storytellerStatusCopy,
} from "./storytellerState";

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined, // subscribe: never fires (mount state never changes)
    () => true,
    () => false,
  );
}

/** The static, server-rendered card (pre-hydration + no-JS). */
function StorytellerExplainer() {
  return (
    <Card>
      <CardHeader>
        <MonoKicker>The storyteller</MonoKicker>
        <p className="max-w-prose text-base leading-relaxed text-fg-muted">
          With JavaScript enabled, this card becomes a live story generator:
          type a prompt and a 6.9M-parameter GPT — trained from scratch on a
          home PC and hand-ported to run right here in your browser — writes a
          short story, one token at a time.
        </p>
      </CardHeader>
    </Card>
  );
}

function StorytellerStudio() {
  const [prompt, setPrompt] = useState("Once upon a time");
  const [temperature, setTemperature] = useState(GEN_DEFAULT_TEMPERATURE);
  const [maxTokens, setMaxTokens] = useState(GEN_DEFAULT_TOKENS);
  const [seed, setSeed] = useState(11);
  const [state, dispatch] = useReducer(
    storytellerReducer,
    initialStorytellerState,
  );
  const preloadedRef = useRef(false);
  const loadedRef = useRef(false);

  // Warm the worker on mount; the model itself waits for the first interaction.
  useEffect(() => {
    requestInit().catch(() => undefined);
  }, []);

  const preloadOnce = () => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    const saveData = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection?.saveData;
    if (!saveData) requestPreload();
  };

  const generate = async (nextSeed: number) => {
    setSeed(nextSeed);
    try {
      if (!loadedRef.current) {
        dispatch({ type: "loadStart" });
        await ensureStorytellerLoaded();
        loadedRef.current = true;
      }
      dispatch({ type: "genStart" });
      const summary = await requestGenerate(
        prompt,
        maxTokens,
        temperature,
        nextSeed,
        (text, tokens) => {
          dispatch({ type: "chunk", text, tokens });
        },
      );
      dispatch(
        summary.cancelled
          ? { type: "genCancelled", tokens: summary.tokens }
          : { type: "genDone", tokens: summary.tokens },
      );
    } catch (err) {
      dispatch({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "The storyteller hit an unexpected error.",
      });
    }
  };

  const busy = state.phase === "loading" || state.phase === "working";
  const hasStory = state.text.length > 0;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <label htmlFor="storyteller-prompt" className="block">
            <MonoKicker>Your prompt</MonoKicker>
          </label>
          <textarea
            id="storyteller-prompt"
            className={`${chatFieldClasses} mt-2 min-h-16`}
            value={prompt}
            rows={2}
            maxLength={200}
            disabled={busy}
            onFocus={preloadOnce}
            onChange={(e) => {
              preloadOnce();
              setPrompt(e.target.value);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="storyteller-temperature" className="block">
              <MonoKicker>Temperature — {temperature.toFixed(2)}</MonoKicker>
            </label>
            <input
              id="storyteller-temperature"
              type="range"
              className="mt-3 w-full"
              min={GEN_MIN_TEMPERATURE}
              max={GEN_MAX_TEMPERATURE}
              step={0.05}
              value={temperature}
              disabled={busy}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="storyteller-length" className="block">
              <MonoKicker>Length — tokens</MonoKicker>
            </label>
            <input
              id="storyteller-length"
              type="number"
              className={fieldClasses}
              min={GEN_MIN_TOKENS}
              max={GEN_MAX_TOKENS}
              value={maxTokens}
              disabled={busy}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n))
                  setMaxTokens(
                    Math.min(GEN_MAX_TOKENS, Math.max(GEN_MIN_TOKENS, n)),
                  );
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {state.phase === "working" && state.cancelArmed ? (
            <>
              <Button onClick={() => requestCancelGenerate()}>
                Confirm stop
              </Button>
              <Button onClick={() => dispatch({ type: "disarmCancel" })}>
                Keep going
              </Button>
            </>
          ) : busy ? (
            <Button onClick={() => dispatch({ type: "armCancel" })}>
              Stop
            </Button>
          ) : hasStory ? (
            <>
              <Button onClick={() => generate(seed + 1)}>Write another</Button>
              {state.phase === "error" ? (
                <Button onClick={() => generate(seed)}>Try again</Button>
              ) : null}
            </>
          ) : (
            <Button onClick={() => generate(seed)}>
              {state.phase === "error" ? "Try again" : "Write a story"}
            </Button>
          )}
          <MonoKicker aria-live="polite">
            {storytellerStatusCopy(state)}
          </MonoKicker>
        </div>

        {hasStory || state.phase === "error" ? (
          <pre className="min-h-24 rounded-md border border-border bg-surface-2 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {state.text}
          </pre>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function Storyteller() {
  const mounted = useMounted();
  return mounted ? <StorytellerStudio /> : <StorytellerExplainer />;
}
