"use client";

/**
 * The /voice studio — record a voice sample, compute the speaker embedding,
 * then synthesize typed text in that voice. All inference happens in the
 * worker (workers/voice.worker.ts); this component only orchestrates state.
 *
 * Consent copy is load-bearing: audio never leaves the device, and the only
 * network request on this page (the +2 reward, Milestone E) carries an empty
 * body.
 */
import { useEffect, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { MonoKicker } from "@/components/ui/MonoKicker";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { encodeWav16BitMono } from "@/lib/voice/wav";
import {
  canStartRecording,
  recordHint,
} from "./recordState";
import {
  canStartSynthesis,
  initialSynthState,
  synthReducer,
  synthStageCopy,
} from "./synthState";
import { requestEmbed, requestSynthesize } from "./voiceClient";
import { VoiceRewardClaim } from "./VoiceRewardClaim";
import { useVoiceRecorder } from "./useVoiceRecorder";

const DEFAULT_TEXT =
  "Hello — this voice was cloned in your browser, and the recording never left your device.";

interface EmbedState {
  phase: "idle" | "working" | "done" | "error";
  stage?: string;
  error?: string;
}

const IDLE_EMBED: EmbedState = { phase: "idle" };

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

export function VoiceStudio() {
  const recorder = useVoiceRecorder();
  const [take, setTake] = useState<Float32Array | null>(null);
  const [embed, setEmbed] = useState<Float32Array | null>(null);
  const [embedState, setEmbedState] = useState<EmbedState>(IDLE_EMBED);
  const [synth, dispatchSynth] = useReducer(synthReducer, undefined, initialSynthState);
  /** Stays true after the first successful synthesis (drives the reward CTA). */
  const [hasSynthesized, setHasSynthesized] = useState(false);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [seed, setSeed] = useState(0);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  // Object URLs live until replaced or the page unmounts.
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const setAndTrackUrl = (
    setter: (url: string | null) => void,
    buffer: ArrayBuffer,
  ): void => {
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    setter(url);
  };

  // Stop → keep the take → compute the embedding automatically.
  async function handleStop(): Promise<void> {
    const pcm = await recorder.stop();
    if (!pcm) return;
    setTake(pcm);
    setEmbed(null);
    setEmbedState({ phase: "working", stage: "Loading the encoder…" });
    setAndTrackUrl(setTakeUrl, encodeWav16BitMono(pcm, 16000));
    const handle = requestEmbed(pcm, (progress) => {
      setEmbedState({
        phase: "working",
        stage:
          progress.stage === "loading"
            ? "Loading the encoder…"
            : "Computing the speaker embedding…",
      });
    });
    try {
      const value = await handle.promise;
      setEmbed(value);
      setEmbedState({ phase: "done" });
    } catch (err) {
      setEmbedState({
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleSynthesize(): Promise<void> {
    if (!embed) return;
    dispatchSynth({ type: "start" });
    const handle = requestSynthesize(text, embed, seed, (progress) => {
      dispatchSynth({ type: "progress", progress });
    });
    try {
      const { samples, sampleRate } = await handle.promise;
      setAndTrackUrl(setResultUrl, encodeWav16BitMono(samples, sampleRate));
      setHasSynthesized(true);
      dispatchSynth({ type: "done" });
    } catch (err) {
      dispatchSynth({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Re-record discards the take, embedding, and synthesis result.
  function handleResetVoice(): void {
    recorder.reset();
    setTake(null);
    setEmbed(null);
    setEmbedState(IDLE_EMBED);
    setTakeUrl(null);
    setResultUrl(null);
    dispatchSynth({ type: "reset" });
  }

  const recording = recorder.state.phase === "recording";
  const synthReady = embed !== null && canStartSynthesis(synth) && text.trim().length > 0;

  return (
    <div className="space-y-8">
      {/* Step 1 — record the voice sample */}
      <Card>
        <CardHeader>
          <MonoKicker>Step 1 — Voice sample</MonoKicker>
          <CardTitle>Record a short voice sample</CardTitle>
          <CardDescription>
            Read the sample text below in your normal voice.{" "}
            {recordHint(recorder.state)}
          </CardDescription>
        </CardHeader>
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-4">
          <MonoKicker className="mb-2">Sample text — read this aloud</MonoKicker>
          <p className="text-sm leading-relaxed text-fg">
            &ldquo;The quick brown fox jumps over the lazy dog while a gentle
            rain falls on the quiet harbour. Numbers sound different from
            words, so count them out: three, seven, twelve, forty-five. This
            voice was recorded in a browser, and it never left this device.&rdquo;
          </p>
          <p className="mt-2 text-xs text-fg-subtle">
            Aim for 10–20 seconds at a natural pace — varied sentences give the
            encoder a better picture of your voice than repeating one line.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {recording ? (
            <Button
              variant="secondary"
              onClick={() => void handleStop()}
              disabled={!recorder.canStop}
            >
              Stop recording ({formatSeconds(recorder.state.seconds)})
            </Button>
          ) : (
            <Button
              onClick={() => void recorder.start()}
              disabled={
                !canStartRecording(recorder.state) ||
                recorder.state.phase === "requesting" ||
                recorder.state.phase === "processing"
              }
            >
              {recorder.state.phase === "requesting"
                ? "Waiting for mic…"
                : recorder.state.phase === "processing"
                  ? "Processing…"
                  : take
                    ? "Record again"
                    : "Start recording"}
            </Button>
          )}
          {take && (
            <Button variant="ghost" onClick={handleResetVoice}>
              Discard sample
            </Button>
          )}
        </div>
        {takeUrl && (
          <div className="mt-4">
            <MonoKicker className="mb-2">Your recording</MonoKicker>
            <audio controls src={takeUrl} className="w-full" />
          </div>
        )}
        {embedState.phase !== "idle" && (
          <p aria-live="polite" className="mt-3 text-sm text-fg-muted">
            {embedState.phase === "working"
              ? embedState.stage
              : embedState.phase === "done"
                ? "Voice captured — you can synthesize below."
                : `Embedding failed: ${embedState.error ?? "unknown error"}`}
          </p>
        )}
      </Card>

      {/* Step 2 — synthesize text in the cloned voice */}
      <Card>
        <CardHeader>
          <MonoKicker>Step 2 — Synthesize</MonoKicker>
          <CardTitle>Make it speak</CardTitle>
          <CardDescription>
            {embed
              ? `Your voice sample (${formatSeconds(recorder.state.seconds || 0)}) is ready. Synthesis takes tens of seconds — progress shows below.`
              : "Available once a voice sample is embedded above."}
          </CardDescription>
        </CardHeader>
        <textarea
          className={fieldClasses}
          rows={3}
          value={text}
          maxLength={280}
          placeholder="Type something for the cloned voice to say…"
          onChange={(event) => setText(event.target.value)}
          disabled={!embed}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleSynthesize()} disabled={!synthReady}>
            {synth.phase === "working" ? "Synthesizing…" : "Synthesize"}
          </Button>
          {synth.phase === "done" && (
            <Button
              variant="ghost"
              onClick={() => {
                setSeed(Date.now() >>> 0);
                void handleSynthesize();
              }}
              disabled={!embed}
            >
              Regenerate (new take)
            </Button>
          )}
        </div>
        {synth.phase === "working" && (
          <p aria-live="polite" className="mt-3 text-sm text-fg-muted">
            {synthStageCopy(synth)}
          </p>
        )}
        {synth.phase === "error" && (
          <p aria-live="assertive" className="mt-3 text-sm text-fg-muted">
            Synthesis failed: {synth.error}
          </p>
        )}
        {resultUrl && synth.phase === "done" && (
          <div className="mt-4 space-y-2">
            <MonoKicker>Result</MonoKicker>
            <audio controls src={resultUrl} className="w-full" />
            <p className="text-sm text-fg-muted">
              <a href={resultUrl} download="voice-clone.wav" className="underline">
                Download the WAV
              </a>{" "}
              — generated at 16 kHz, entirely on this device.
            </p>
          </div>
        )}
      </Card>

      {/* One-time reward — appears after the first successful synthesis. */}
      {hasSynthesized && (
        <Card>
          <CardHeader>
            <MonoKicker>Bonus</MonoKicker>
            <CardTitle>JTB interaction reward</CardTitle>
          </CardHeader>
          <div className="mt-2">
            <VoiceRewardClaim />
          </div>
        </Card>
      )}
    </div>
  );
}