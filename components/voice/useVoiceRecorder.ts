"use client";

/**
 * Microphone capture for /voice — raw Float32 PCM via AudioWorklet (the
 * exact samples the mel pipeline wants), resampled to the encoder's 16 kHz
 * with an OfflineAudioContext on stop. Drives the recordState machine; the
 * component only sees state + a 16 kHz mono take.
 *
 * Device-only: the MediaStream and all samples stay in this tab — nothing in
 * this hook performs network I/O.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  canStopRecording,
  initialRecordState,
  MAX_RECORD_SECONDS,
  recordReducer,
} from "./recordState";

const WORKLET_URL = "/worklets/pcm-recorder-worklet.js";
const TARGET_RATE = 16000; // encoder SR

interface RecorderController {
  state: ReturnType<typeof initialRecordState>;
  canStop: boolean;
  start: () => Promise<void>;
  /** Stop and resample; resolves null when there is nothing to stop. */
  stop: () => Promise<Float32Array | null>;
  reset: () => void;
}

export function useVoiceRecorder(): RecorderController {
  const [state, dispatch] = useReducer(recordReducer, undefined, initialRecordState);

  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const samplesRef = useRef(0);
  const nativeRateRef = useRef(48000);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  /** Set by stop(); auto-stop at the cap resolves the same promise. */
  const stopResolverRef = useRef<((pcm: Float32Array | null) => void) | null>(null);

  const teardown = useCallback(async (): Promise<void> => {
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const ctx = contextRef.current;
    contextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        // already closed — nothing to do
      }
    }
  }, []);

  // Release mic + audio graph if the component unmounts mid-take.
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  const finalize = useCallback(async (): Promise<Float32Array | null> => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    samplesRef.current = 0;
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const joined = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    await teardown();
    try {
      const native = nativeRateRef.current;
      if (native === TARGET_RATE || joined.length === 0) return joined;
      const length = Math.ceil((joined.length * TARGET_RATE) / native);
      const offline = new OfflineAudioContext(1, length, TARGET_RATE);
      const buffer = offline.createBuffer(1, joined.length, native);
      buffer.copyToChannel(joined, 0);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0).slice();
    } catch (err) {
      dispatch({
        type: "error",
        message: err instanceof Error
          ? err.message
          : "Could not process the recording — try again.",
      });
      return null;
    }
  }, [teardown]);

  const finishPending = useCallback((): void => {
    const resolver = stopResolverRef.current;
    stopResolverRef.current = null;
    if (!resolver) return;
    dispatch({ type: "processing" });
    void finalize().then((pcm) => resolver(pcm));
  }, [finalize]);

  const start = useCallback(async (): Promise<void> => {
    dispatch({ type: "request" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      contextRef.current = ctx;
      nativeRateRef.current = ctx.sampleRate;
      await ctx.audioWorklet.addModule(WORKLET_URL);

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-recorder");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const batch = event.data;
        chunksRef.current.push(batch);
        samplesRef.current += batch.length;
        const seconds = samplesRef.current / nativeRateRef.current;
        dispatch({ type: "tick", seconds });
        if (seconds >= MAX_RECORD_SECONDS) finishPending();
      };
      source.connect(node);
      // The worklet is a sink — connect it to a zero-gain node so it pulls.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(ctx.destination);

      chunksRef.current = [];
      samplesRef.current = 0;
      dispatch({ type: "granted" });
    } catch (err) {
      dispatch({
        type: "error",
        message:
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone permission was denied — allow access and try again."
            : err instanceof Error
              ? err.message
              : "Microphone unavailable — check browser permissions.",
      });
      await teardown();
    }
  }, [finishPending, teardown]);

  const stop = useCallback((): Promise<Float32Array | null> => {
    if (!canStopRecording(stateRef.current)) return Promise.resolve(null);
    return new Promise<Float32Array | null>((resolve) => {
      stopResolverRef.current = resolve;
      finishPending();
    });
  }, [finishPending]);

  const reset = useCallback((): void => {
    dispatch({ type: "reset" });
    chunksRef.current = [];
    samplesRef.current = 0;
  }, []);

  return { state, canStop: canStopRecording(state), start, stop, reset };
}