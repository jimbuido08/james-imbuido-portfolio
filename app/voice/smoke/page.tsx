"use client";

/**
 * Milestone A browser smoke — TEMPORARY, noindex. Runs the five voice ONNX
 * graphs in a real Web Worker and renders per-stage timings so the gate can
 * be measured in real Chrome and Safari. Removed once the gate passes and
 * /voice is built.
 */
import { useEffect, useState } from "react";

import type { SmokeStage } from "@/workers/voiceSmoke.worker";

interface Done {
  type: "done";
  failures: string[];
}

type Message = SmokeStage | Done;

const STAGE_LABELS: Record<string, string> = {
  encoder: "encoder [1,40,160]",
  "synth-encode": "synth encode T=50",
  "synth-step": "synth step ×64 (loop-carried)",
  "voc-upsample": "voc upsample [1,80,32]",
  "voc-chunk": "voc chunk (1 frame = 200 samples)",
};

export default function VoiceSmokePage() {
  const [stages, setStages] = useState<Record<string, SmokeStage>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../workers/voiceSmoke.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if ("type" in message) {
        setDone(message);
      } else {
        setStages((prev) => ({ ...prev, [message.id]: message }));
      }
    };
    worker.onerror = (event) => {
      setError(`worker error: ${event.message}`);
    };
    return () => worker.terminate();
  }, []);

  const rows = Object.entries(STAGE_LABELS).map(([id, label]) => ({
    id,
    label,
    stage: stages[id],
  }));

  return (
    <main style={{ fontFamily: "monospace", padding: 24, maxWidth: 720 }}>
      <h1>Voice smoke (Milestone A gate)</h1>
      <p>
        Temporary noindex page. Five ONNX graphs, wasm numThreads=1, synthetic
        inputs. Numbers go in docs/notes/voice-cloning-architecture.md §3.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(({ id, label, stage }) => (
            <tr key={id} style={{ borderTop: "1px solid #444" }}>
              <td style={{ padding: 8 }}>{label}</td>
              <td style={{ padding: 8 }}>
                {stage === undefined
                  ? "queued"
                  : stage.status === "running"
                    ? "running…"
                    : stage.status === "pass"
                      ? `pass — ${stage.detail ?? `${stage.ms?.toFixed(2)} ms`}`
                      : `FAIL — ${stage.detail ?? ""}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {done && (
        <p style={{ marginTop: 16, fontWeight: 700 }}>
          {done.failures.length === 0
            ? "GATE: all stages pass in-browser — record numbers"
            : `GATE: FAIL (${done.failures.join(", ")})`}
        </p>
      )}
    </main>
  );
}
