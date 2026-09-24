"use client";

/**
 * The training story — static data, no worker, no inference: the measured
 * validation-loss curve and a scrubber over the 16 recorded mid-train samples
 * ("watch it learn to speak"). Every value comes from the committed run log
 * via the generated lib/storyteller/trainingData.ts; the gate checks the
 * module against the log, so this card can't drift from the real training run.
 */

import { useState } from "react";

import {
  sparklinePoints,
  type LossPoint,
} from "@/components/llm-lab/trainState";
import { Card, CardHeader } from "@/components/ui/Card";
import { MonoKicker } from "@/components/ui/MonoKicker";
import {
  EVOLUTION_SAMPLES,
  LOSS_POINTS,
  TRAINING_FACTS,
} from "@/lib/storyteller/trainingData";

/** The last recorded eval at or before a sample step (samples sit at 250-step marks). */
function lossAt(step: number): number {
  let loss = LOSS_POINTS[0].valLoss;
  for (const p of LOSS_POINTS) {
    if (p.step <= step) loss = p.valLoss;
  }
  return loss;
}

export function TrainingStory() {
  const [index, setIndex] = useState(0);
  const sample = EVOLUTION_SAMPLES[index];
  const history: LossPoint[] = LOSS_POINTS.map((p) => ({
    step: p.step,
    lossEma: p.valLoss,
  }));
  const points = sparklinePoints(history, 320, 64);

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <MonoKicker>How it learned — validation loss</MonoKicker>
          {points ? (
            <svg
              viewBox="0 0 320 64"
              role="img"
              aria-label="Validation loss falling from 8.97 to 2.01 over 4,000 training steps"
              className="max-w-[320px] text-fg"
            >
              <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          ) : null}
          <p className="max-w-prose text-sm text-fg-muted">
            The measured run:{" "}
            {TRAINING_FACTS.corpusTokens.toLocaleString("en-US")} tokens of
            TinyStories, {TRAINING_FACTS.steps.toLocaleString("en-US")} AdamW
            steps in about {TRAINING_FACTS.trainingMinutes} minutes on a home PC
            — validation loss {TRAINING_FACTS.startValLoss.toFixed(2)} →{" "}
            {TRAINING_FACTS.finalValLoss.toFixed(3)} (perplexity{" "}
            {TRAINING_FACTS.finalValPpl}).
          </p>
        </CardHeader>
      </Card>

      <Card className="mt-6">
        <CardHeader className="space-y-3">
          <MonoKicker>Watch it learn — same prompt, 16 snapshots</MonoKicker>
          <label htmlFor="storyteller-evolution" className="block">
            <span className="text-sm text-fg-muted">
              Training step {sample.step.toLocaleString("en-US")} of{" "}
              {TRAINING_FACTS.steps.toLocaleString("en-US")} — validation loss{" "}
              {lossAt(sample.step).toFixed(2)}
            </span>
          </label>
          <input
            id="storyteller-evolution"
            type="range"
            className="w-full"
            min={0}
            max={EVOLUTION_SAMPLES.length - 1}
            step={1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
          <pre className="min-h-24 rounded-md border border-border bg-surface-2 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {sample.text}
          </pre>
          <p className="max-w-prose text-sm text-fg-subtle">
            From uniform noise to coherent stories — the recorded samples are
            exactly what the model wrote at each point during training.
          </p>
        </CardHeader>
      </Card>
    </>
  );
}
