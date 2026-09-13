import type { Metadata } from "next";

import { PageShell } from "@/components/ui/PageShell";
import { LlmLab } from "@/components/llm-lab/LlmLab";

export const metadata: Metadata = {
  title: "LLM Lab — James Imbuido",
  description:
    "Train a tiny byte-level language model in your browser — pick a corpus, watch the loss fall live, sample from the result, and keep the model file. Runs entirely on your device.",
};

export default function LlmLabPage() {
  return (
    <PageShell href="/llm-lab">
      <p className="mt-8 max-w-prose text-fg-muted">
        This is a hands-on look at what language model training actually is: a
        small transformer — embedding, a few attention layers, a tied output
        head — trained with backpropagation in a web worker by a trainer written
        in plain TypeScript, with no ML framework involved. Sixty seconds gets
        it from noise to word fragments; the sample James trains overnight on
        this site&rsquo;s approved copy shows where the same workflow ends up.
        Its output recites and remixes what it has seen — it is not the grounded
        JTB chatbot, so treat anything it says about James as wordplay, not
        fact.
      </p>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        Privacy by architecture: nothing you paste, fetch, train, or generate
        leaves your device. The only network requests are fetching this
        site&rsquo;s sample model file or a text URL you explicitly ask for.
      </p>
      <LlmLab />
    </PageShell>
  );
}
