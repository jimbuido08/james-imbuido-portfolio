"use client";

/**
 * The /llm-lab studio — five guided step cards (Corpus → Configure → Train →
 * Generate → Model file) over the state machines in labState/trainState/
 * genState and the worker seam in llmClient. All computation happens in the
 * worker; this component only renders state and dispatches requests.
 *
 * Load-bearing copy rule (like /voice): the privacy sentence lives on the
 * page. Nothing a visitor types or trains leaves their device; the only
 * network requests are fetching this site's sample checkpoint or a URL they
 * explicitly ask to fetch (direct browser fetch — no server proxy).
 */
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { MonoKicker } from "@/components/ui/MonoKicker";
import { fieldClasses } from "@/components/ui/fieldClasses";

import {
  MAX_STEPS,
  MIN_STEPS,
  PRESETS,
  TARGET_TRAIN_SECONDS,
  paramCount,
} from "../../lib/llm/config";
import type { PresetKey } from "../../lib/llm/config";
import { estimateArtifactBytes } from "../../lib/llm/artifact";
import { fetchSampleArtifact, fetchUrlText } from "../../lib/llm/loader";
import { bytePreview, encodeBytes } from "../../lib/llm/tokenizer";
import * as lab from "./labState";
import type { LabEnv, LabState } from "./labState";
import * as train from "./trainState";
import type { TrainState } from "./trainState";
import * as gen from "./genState";
import type { GenState } from "./genState";
import {
  requestCancelTrain,
  requestExportArtifact,
  requestGenerate,
  requestInit,
  requestLoadArtifact,
  requestTrain,
} from "./llmClient";

// ---- device environment (hydration-safe, lib/universe/capabilities.ts pattern) --
// The interactive tree only mounts after `useMounted()` flips true, so initial
// reducers can read the real device synchronously; reduced-motion additionally
// stays reactive via a media-query subscription.

const noopSubscribe = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** One-shot client-side device read — only call after mount. */
function detectLabEnv(): LabEnv {
  return {
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    smallScreen: window.matchMedia("(max-width: 640px)").matches,
    saveData:
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  };
}

// ---- corpus card ---------------------------------------------------------------

const CORPUS_OPTIONS: Array<{
  key: lab.CorpusKey;
  label: string;
  hint: string;
}> = [
  {
    key: "bundled",
    label: "Bundled excerpt",
    hint: "A ~48 KB public-domain Shakespeare excerpt that ships with this page — works offline.",
  },
  {
    key: "portfolio",
    label: "This site",
    hint: "The approved copy James's JTB chatbot is grounded in. Tiny, so the model memorises it — that's the demo.",
  },
  {
    key: "paste",
    label: "Paste your own text",
    hint: "Any text, 512 B to 512 KB. It never leaves this tab.",
  },
  {
    key: "url",
    label: "Text from a URL",
    hint: "Fetched directly by your browser (no server in between) — some sites block this; paste instead when they do.",
  },
];

function CorpusCard({
  labState,
  dispatchLab,
}: {
  labState: LabState;
  dispatchLab: React.Dispatch<lab.LabAction>;
}) {
  const [urlDraft, setUrlDraft] = useState("");
  const bytes =
    labState.corpusKey === "url" && labState.urlPhase !== "ready"
      ? 0
      : lab.corpusByteCount(labState);
  const text = lab.resolveCorpusText(labState);
  const previewIds = encodeBytes(text.slice(0, 64));
  const problem = lab.corpusProblem(labState);

  const startFetch = () => {
    dispatchLab({ type: "urlFetchStart" });
    fetchUrlText(urlDraft)
      .then((text) => dispatchLab({ type: "urlFetchOk", text }))
      .catch((err: unknown) =>
        dispatchLab({
          type: "urlFetchError",
          message:
            err instanceof Error ? err.message : "Couldn't fetch that URL.",
        }),
      );
  };

  return (
    <Card>
      <CardHeader>
        <MonoKicker>Step 1 — Corpus</MonoKicker>
        <CardTitle>Pick what it learns from</CardTitle>
        <CardDescription>
          A language model is just the statistics of its training text. This one
          is byte-level: one token per byte, 256-token vocabulary.
        </CardDescription>
      </CardHeader>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Corpus</legend>
        {CORPUS_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex cursor-pointer items-start gap-3 text-sm"
          >
            <input
              type="radio"
              name="corpus"
              className="mt-1"
              checked={labState.corpusKey === opt.key}
              onChange={() =>
                dispatchLab({ type: "selectCorpus", key: opt.key })
              }
            />
            <span>
              <span className="font-medium text-fg">{opt.label}</span>
              <span className="block text-fg-muted">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {labState.corpusKey === "paste" && (
        <div className="mt-4">
          <textarea
            className={fieldClasses}
            rows={6}
            value={labState.pasteText}
            onChange={(e) =>
              dispatchLab({ type: "setPaste", text: e.target.value })
            }
            placeholder="Paste anything — lyrics, your notes, a chapter…"
            aria-label="Text to train on"
          />
        </div>
      )}

      {labState.corpusKey === "url" && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input
              className={fieldClasses}
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://…/some-text.txt"
              aria-label="URL of a text file to fetch"
            />
            <Button
              variant="secondary"
              onClick={startFetch}
              disabled={
                labState.urlPhase === "loading" || urlDraft.trim() === ""
              }
            >
              {labState.urlPhase === "loading" ? "Fetching…" : "Fetch text"}
            </Button>
          </div>
          {labState.urlPhase === "error" && (
            <p className="text-sm text-fg" role="alert">
              {labState.urlError}
            </p>
          )}
          {labState.urlPhase === "ready" && (
            <p className="text-sm text-fg-muted">
              Fetched {encodeBytes(labState.urlText).length.toLocaleString()}{" "}
              bytes.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="font-mono text-xs text-fg-subtle">
          {bytes.toLocaleString()} bytes ≈ {bytes.toLocaleString()} tokens
          {bytes > 0 && (
            <>
              {" · first bytes: "}
              <span className="break-all">{bytePreview(previewIds, 16)}</span>
            </>
          )}
        </p>
        {problem && labState.urlPhase !== "loading" && (
          <p className="mt-2 text-sm text-fg">{problem}</p>
        )}
      </div>
    </Card>
  );
}

// ---- configure card -------------------------------------------------------------

function ConfigureCard({
  labState,
  dispatchLab,
}: {
  labState: LabState;
  dispatchLab: React.Dispatch<lab.LabAction>;
}) {
  return (
    <Card>
      <CardHeader>
        <MonoKicker>Step 2 — Configure</MonoKicker>
        <CardTitle>Size it for your device</CardTitle>
        <CardDescription>
          A bigger model learns more per step but each step costs more. The step
          count is sized for about {TARGET_TRAIN_SECONDS} seconds
          {labState.measuredGflops
            ? ` on this device (measured ${labState.measuredGflops.toFixed(1)} GFLOP/s)`
            : ""}
          .
        </CardDescription>
      </CardHeader>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Model size preset</legend>
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
          const p = PRESETS[key];
          const params = paramCount(p.config);
          return (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 text-sm"
            >
              <input
                type="radio"
                name="preset"
                className="mt-1"
                checked={labState.presetKey === key}
                onChange={() => dispatchLab({ type: "setPreset", key })}
              />
              <span>
                <span className="font-medium text-fg">
                  {p.label} — {params.toLocaleString()} parameters
                </span>
                <span className="block text-fg-muted">{p.blurb}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-fg">Training steps</span>
          <input
            className={fieldClasses}
            type="number"
            min={MIN_STEPS}
            max={MAX_STEPS}
            value={labState.steps}
            onChange={(e) =>
              dispatchLab({
                type: "setSteps",
                steps: Math.min(
                  MAX_STEPS,
                  Math.max(
                    MIN_STEPS,
                    Math.floor(Number(e.target.value) || MIN_STEPS),
                  ),
                ),
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-fg">
            Seed{" "}
            <button
              type="button"
              className="text-fg-subtle underline underline-offset-2 hover:text-fg"
              onClick={() =>
                dispatchLab({
                  type: "setSeed",
                  seed: Math.floor(Math.random() * 2 ** 31),
                })
              }
            >
              randomise
            </button>
          </span>
          <input
            className={fieldClasses}
            type="number"
            min={0}
            value={labState.seed}
            onChange={(e) =>
              dispatchLab({
                type: "setSeed",
                seed: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        Same corpus + same settings + same seed = the same model, every time.
      </p>
    </Card>
  );
}

// ---- train card -------------------------------------------------------------------

function TrainCard({
  labState,
  trainState,
  dispatchTrain,
  onStart,
  onCancel,
  reducedMotion,
}: {
  labState: LabState;
  trainState: TrainState;
  dispatchTrain: React.Dispatch<train.TrainAction>;
  onStart: () => void;
  onCancel: () => void;
  reducedMotion: boolean;
}) {
  const working = trainState.phase === "working";
  const points = train.sparklinePoints(trainState.history, 320, 64);
  return (
    <Card>
      <CardHeader>
        <MonoKicker>Step 3 — Train</MonoKicker>
        <CardTitle>Watch it learn</CardTitle>
        <CardDescription>
          Loss drops as the model absorbs the corpus; the short samples below
          show the model&rsquo;s voice forming mid-run.
        </CardDescription>
      </CardHeader>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={onStart}
          disabled={!lab.canStartTrain(labState, trainState.phase)}
        >
          {trainState.phase === "done" || trainState.phase === "cancelled"
            ? "Train again"
            : "Start training"}
        </Button>
        {working &&
          (trainState.cancelArmed ? (
            <>
              <Button variant="secondary" onClick={onCancel}>
                Confirm stop
              </Button>
              <Button
                variant="ghost"
                onClick={() => dispatchTrain({ type: "disarmCancel" })}
              >
                Keep going
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => dispatchTrain({ type: "armCancel" })}
            >
              Stop early
            </Button>
          ))}
        {trainState.phase === "cancelling" && (
          <Button variant="secondary" disabled>
            Stopping…
          </Button>
        )}
      </div>

      <p className="mt-4 text-sm text-fg-muted" aria-live="polite">
        {train.trainStatusCopy(trainState)}
      </p>

      {trainState.history.length > 1 &&
        (reducedMotion ? (
          <p className="mt-2 font-mono text-xs text-fg-subtle">
            loss now {trainState.lossEma.toFixed(3)}
            {" · started "} {trainState.history[0].lossEma.toFixed(3)}
          </p>
        ) : (
          <svg
            viewBox="0 0 320 64"
            className="mt-2 h-16 w-full max-w-sm text-fg-muted"
            role="img"
            aria-label="Loss curve falling over training steps"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        ))}

      {trainState.sample !== null && trainState.phase !== "idle" && (
        <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-xs text-fg-muted">
          {trainState.sample}
        </pre>
      )}
      {trainState.phase === "error" && (
        <p className="mt-3 text-sm text-fg" role="alert">
          {trainState.error}
        </p>
      )}
    </Card>
  );
}

// ---- generate card ----------------------------------------------------------------

function GenerateCard({
  labState,
  genState,
  dispatchGen,
  onGenerate,
  onRegenerate,
}: {
  labState: LabState;
  genState: GenState;
  dispatchGen: React.Dispatch<gen.GenAction>;
  onGenerate: (seed: number) => void;
  onRegenerate: () => void;
}) {
  const available = labState.provenance !== "none";
  return (
    <Card>
      <CardHeader>
        <MonoKicker>Step 4 — Generate</MonoKicker>
        <CardTitle>
          Sample from {lab.provenanceLabel(labState.provenance)}
        </CardTitle>
        <CardDescription>
          Give it a start and it continues, byte by byte. Higher temperature
          takes more risks.
        </CardDescription>
      </CardHeader>

      <div className="mt-4">
        <textarea
          className={fieldClasses}
          rows={2}
          value={genState.prompt}
          onChange={(e) =>
            dispatchGen({ type: "setPrompt", prompt: e.target.value })
          }
          placeholder="The first few characters… (empty starts from a newline)"
          aria-label="Prompt text"
          disabled={!available}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-fg">
              Temperature — {genState.temperature.toFixed(2)}
            </span>
            <input
              type="range"
              className="mt-2 w-full"
              min={gen.MIN_TEMPERATURE}
              max={gen.MAX_TEMPERATURE}
              step={0.05}
              value={genState.temperature}
              onChange={(e) =>
                dispatchGen({
                  type: "setTemperature",
                  temperature: Number(e.target.value),
                })
              }
              disabled={!available}
              aria-label="Sampling temperature"
            />
          </label>
          <label className="block text-sm">
            <span className="text-fg">Length (bytes)</span>
            <input
              className={fieldClasses}
              type="number"
              min={gen.MIN_GEN_TOKENS}
              max={gen.MAX_GEN_TOKENS}
              value={genState.maxTokens}
              onChange={(e) =>
                dispatchGen({
                  type: "setMaxTokens",
                  maxTokens: Math.min(
                    gen.MAX_GEN_TOKENS,
                    Math.max(
                      gen.MIN_GEN_TOKENS,
                      Math.floor(Number(e.target.value) || gen.MIN_GEN_TOKENS),
                    ),
                  ),
                })
              }
              disabled={!available}
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() => onGenerate(genState.seed)}
            disabled={!gen.canGenerateNow(genState, labState.provenance)}
          >
            {genState.phase === "working" ? "Generating…" : "Generate"}
          </Button>
          {genState.phase === "done" && (
            <Button variant="secondary" onClick={onRegenerate}>
              Regenerate (new take)
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-fg-muted" aria-live="polite">
        {gen.genStatusCopy(genState, labState.provenance)}
      </p>
      {genState.text !== "" && (
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-sm text-fg">
          {genState.text}
        </pre>
      )}
      {genState.phase === "error" && (
        <p className="mt-3 text-sm text-fg" role="alert">
          {genState.error}
        </p>
      )}
    </Card>
  );
}

// ---- model-file card ---------------------------------------------------------------

function ModelFileCard({
  labState,
  onDownload,
  onUpload,
  onLoadSample,
}: {
  labState: LabState;
  onDownload: () => void;
  onUpload: (file: File) => Promise<void>;
  onLoadSample: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"sample" | "upload" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const sampleBytes = estimateArtifactBytes(PRESETS.small.config, 1);

  const humanMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  const loadSample = () => {
    setBusy("sample");
    setActionError(null);
    setLoadedNote(null);
    onLoadSample()
      .then(() =>
        setLoadedNote(
          "Sample loaded. It recites and remixes this site's copy — it is not the grounded JTB chatbot, so treat its facts as wordplay.",
        ),
      )
      .catch((err: unknown) =>
        setActionError(humanMessage(err, "Couldn't load the sample.")),
      )
      .finally(() => setBusy(null));
  };

  const upload = (file: File) => {
    setBusy("upload");
    setActionError(null);
    setLoadedNote(null);
    onUpload(file)
      .then(() =>
        setLoadedNote(
          `Loaded ${file.name} — head to Step 4 to sample from it.`,
        ),
      )
      .catch((err: unknown) =>
        setActionError(humanMessage(err, "Couldn't read that model file.")),
      )
      .finally(() => setBusy(null));
  };

  return (
    <Card>
      <CardHeader>
        <MonoKicker>Model file</MonoKicker>
        <CardTitle>Keep it, share it, come back to it</CardTitle>
        <CardDescription>
          A trained model is a small binary file. Download yours, or load
          James&rsquo;s sample (~{(sampleBytes / 1048576).toFixed(1)} MB)
          trained overnight on this site&rsquo;s approved copy.
        </CardDescription>
      </CardHeader>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={onDownload}
          disabled={labState.provenance === "none"}
        >
          Download your model
        </Button>
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "upload" ? "Reading…" : "Upload a model file"}
        </Button>
        <Button
          variant="secondary"
          onClick={loadSample}
          disabled={busy !== null}
        >
          {busy === "sample" ? "Loading sample…" : "Load the sample"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".bin"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = ""; // allow re-uploading the same file
          }}
        />
      </div>
      {loadedNote && (
        <p className="mt-3 text-sm text-fg-muted" aria-live="polite">
          {loadedNote} Currently live:{" "}
          {lab.provenanceLabel(labState.provenance)}.
        </p>
      )}
      {actionError && (
        <p className="mt-3 text-sm text-fg" role="alert">
          {actionError}
        </p>
      )}
    </Card>
  );
}

// ---- the studio ------------------------------------------------------------------

/**
 * The interactive lab mounts only after hydration (showCanvas precedent): the
 * server and the no-JS visitor both get this static explainer, identical to
 * the first client render — then the real tree mounts and reads the device.
 */
export function LlmLab() {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <div className="mt-10">
        <Card>
          <CardHeader>
            <MonoKicker>The lab</MonoKicker>
            <CardTitle>
              Five steps: corpus, configure, train, generate, keep
            </CardTitle>
            <CardDescription>
              The interactive lab needs JavaScript — above, the page explains
              what it does and why nothing leaves your device. With JS on, five
              cards appear here: pick a corpus, size the model, train it live in
              a web worker, sample text from it, and download the model file.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  return <LlmLabInner />;
}

function LlmLabInner() {
  // Read once per mount: the environment that picks the default preset.
  const [env] = useState(detectLabEnv);
  const [labState, dispatchLab] = useReducer(
    lab.labReducer,
    env,
    lab.initialLabState,
  );
  const [trainState, dispatchTrain] = useReducer(
    train.trainReducer,
    undefined,
    train.initialTrainState,
  );
  const [genState, dispatchGen] = useReducer(
    gen.genReducer,
    undefined,
    gen.initialGenState,
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const downloadUrlRef = useRef<string | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);

  // Warm the worker + measure the device as soon as the page is interactive.
  useEffect(() => {
    requestInit()
      .then((measuredGflops) =>
        dispatchLab({ type: "calibrated", measuredGflops }),
      )
      .catch(() => undefined); // fall back to preset defaults silently
  }, []);

  // Revoke the last download URL on unmount (object-URL lifecycle, voice precedent).
  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      decoderRef.current = null;
    };
  }, []);

  const startTraining = () => {
    const bytes = encodeBytes(lab.resolveCorpusText(labState));
    dispatchTrain({ type: "start", totalSteps: labState.steps });
    const handle = requestTrain(
      bytes,
      labState.presetKey,
      labState.steps,
      labState.seed,
      (p) => dispatchTrain({ type: "progress", progress: p }),
    );
    handle.promise
      .then((outcome) => {
        if (outcome.kind === "done") {
          dispatchTrain({
            type: "done",
            finalLoss: outcome.finalLoss,
            elapsedMs: outcome.elapsedMs,
          });
        } else {
          dispatchTrain({
            type: "cancelled",
            atStep: outcome.atStep,
            lossEma: outcome.lossEma,
          });
        }
        dispatchLab({ type: "setProvenance", provenance: "trained" });
      })
      .catch((err: unknown) =>
        dispatchTrain({
          type: "error",
          message: err instanceof Error ? err.message : "Training failed.",
        }),
      );
  };

  const startGenerate = (seed: number) => {
    decoderRef.current = new TextDecoder();
    dispatchGen({ type: "start" });
    const promptIds = encodeBytes(genState.prompt);
    const handle = requestGenerate(
      promptIds,
      genState.maxTokens,
      genState.temperature,
      seed,
      (ids, done) => {
        if (done) return;
        dispatchGen({
          type: "chunk",
          text: decoderRef.current!.decode(ids, { stream: true }),
        });
      },
    );
    handle.promise
      .then(() => dispatchGen({ type: "done" }))
      .catch((err: unknown) =>
        dispatchGen({
          type: "error",
          message: err instanceof Error ? err.message : "Generation failed.",
        }),
      );
  };

  const downloadModel = () => {
    requestExportArtifact()
      .then(({ bytes, suggestedName }) => {
        if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
        const url = URL.createObjectURL(
          new Blob([bytes], { type: "application/octet-stream" }),
        );
        downloadUrlRef.current = url;
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestedName;
        a.click();
      })
      .catch(() => undefined); // button is disabled when there's no model; nothing to report
  };

  const uploadModel = (file: File): Promise<void> =>
    file
      .arrayBuffer()
      .then((buf) => requestLoadArtifact(new Uint8Array(buf), "upload"))
      .then(() => dispatchLab({ type: "setProvenance", provenance: "upload" }));

  const loadSample = async (): Promise<void> => {
    const bytes = await fetchSampleArtifact();
    await requestLoadArtifact(bytes, "sample");
    dispatchLab({ type: "setProvenance", provenance: "sample" });
  };

  return (
    <div className="mt-10 space-y-6">
      <CorpusCard labState={labState} dispatchLab={dispatchLab} />
      <ConfigureCard labState={labState} dispatchLab={dispatchLab} />
      <TrainCard
        labState={labState}
        trainState={trainState}
        dispatchTrain={dispatchTrain}
        onStart={startTraining}
        onCancel={() => {
          dispatchTrain({ type: "cancelling" });
          requestCancelTrain();
        }}
        reducedMotion={reducedMotion}
      />
      <GenerateCard
        labState={labState}
        genState={genState}
        dispatchGen={dispatchGen}
        onGenerate={startGenerate}
        onRegenerate={() => {
          dispatchGen({ type: "regenerate" });
          startGenerate(genState.seed + 1);
        }}
      />
      <ModelFileCard
        labState={labState}
        onDownload={downloadModel}
        onUpload={uploadModel}
        onLoadSample={loadSample}
      />
    </div>
  );
}
