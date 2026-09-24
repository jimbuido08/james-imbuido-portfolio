import type { Metadata } from "next";

import { PageShell } from "@/components/ui/PageShell";
import { Storyteller } from "@/components/storyteller/Storyteller";
import { TrainingStory } from "@/components/storyteller/TrainingStory";

export const metadata: Metadata = {
  title: "Storyteller — James Imbuido",
  description:
    "Type a prompt and James's own from-scratch GPT — 6.9M parameters trained on a home PC — writes a short story entirely in your browser.",
};

export default function StorytellerPage() {
  return (
    <PageShell href="/storyteller">
      <p className="mt-8 max-w-prose text-base leading-relaxed text-fg-muted">
        This is a GPT James trained from scratch — the data pipeline, the
        tokenizer, the architecture, and the training loop, all built by hand
        and trained on a home PC with no CUDA GPU and no cloud: 6,917,376
        parameters, 66.7 million tokens of TinyStories, about 100 minutes of
        CPU. The inference engine below is a hand-written TypeScript port of
        that exact model — it writes stories in your browser, in a web worker.
      </p>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        Nothing you type or generate leaves your device — the only network
        requests are the one-time 13.8 MB model and 0.6 MB tokenizer download,
        cached afterwards. And it invents freely: characters drift, names change
        mid-story, endings aren&apos;t guaranteed. That is what a 7M-parameter
        model is — the limits are part of the demo.
      </p>
      <div className="mt-8">
        <Storyteller />
      </div>
      <div className="mt-6">
        <TrainingStory />
      </div>
    </PageShell>
  );
}
