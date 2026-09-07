import type { Metadata } from "next";

import { VoiceStudio } from "@/components/voice/VoiceStudio";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "Real-Time Voice Cloning — James Imbuido",
  description:
    "Clone a voice from a short recording and hear it speak — the SV2TTS models run entirely in your browser, and audio never leaves your device.",
};

export default function VoicePage() {
  return (
    <PageShell href="/voice">
      <p className="mt-8 max-w-prose text-fg-muted">
        Record a short voice sample and this page converts it into a speaker
        embedding, then speaks any text you type in that voice — the same
        three-model pipeline as the &ldquo;Real-Time Voice Cloning&rdquo;
        reference implementation (speaker encoder, Tacotron synthesizer,
        WaveRNN vocoder), converted to ONNX and executed client-side over
        WebAssembly.
      </p>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        Privacy by architecture: your recording and the generated audio never
        leave your device — there is no upload endpoint to send them to. The
        models (~111&nbsp;MB, cached by your browser) download only when you
        record, and synthesis takes tens of seconds per sentence on the
        single-threaded wasm backend.
      </p>
      <VoiceStudio />
    </PageShell>
  );
}