"""Ground-truth stage comparison: reference PyTorch SV2TTS vs the shipped ONNX
graphs, on identical inputs (text + real speech embedding from p240).

Pinpoints which stage diverges: text/encoding, Tacotron mel, vocoder samples.
Machine-local diagnostic — not part of the gate.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "_rtvc-src"))
sys.path.insert(0, str(HERE))

TEXT = "This voice was cloned entirely in a web browser."
SAMPLE = HERE / "_rtvc-src/samples/p240_00000.mp3"


def main() -> int:
    import librosa
    import torch

    from clean_text import clean_and_sequence
    import mel_ref
    import synthesize_sample as ss
    ss.mel_ref = mel_ref  # synthesize_sample resolves mel_ref lazily in main()
    import export_vocoder as ev

    # --- shared inputs -------------------------------------------------------
    wav, _ = librosa.load(str(SAMPLE), sr=16000, mono=True)
    wav = wav.astype(np.float32)
    ids = clean_and_sequence(TEXT)
    print(f"text -> {len(ids)} symbols")

    # --- embedding: ONNX encoder (shipped path) ------------------------------
    encoder = ort.InferenceSession(
        str(HERE / "export/voice-encoder.onnx"), providers=["CPUExecutionProvider"])
    embed = ss.embed_utterance(encoder, wav)
    print("onnx embed norm", float(np.linalg.norm(embed)))

    # --- reference synthesizer -----------------------------------------------
    from synthesizer.inference import Synthesizer
    synth = Synthesizer(HERE / "pretrained/synthesizer.pt", verbose=False)
    t0 = time.time()
    ref_mel = synth.synthesize_spectrograms([TEXT], [embed])[0]  # (80, T) ±4
    print(f"reference tacotron mel {ref_mel.shape} in {time.time()-t0:.1f}s, "
          f"range {ref_mel.min():.2f}..{ref_mel.max():.2f}")

    # --- onnx tacotron mel (shipped path) ------------------------------------
    encode = ort.InferenceSession(
        str(HERE / "export/voice-synth-encode.onnx"), providers=["CPUExecutionProvider"])
    step = ort.InferenceSession(
        str(HERE / "export/voice-synth-step.onnx"), providers=["CPUExecutionProvider"])
    text = np.asarray([ids], dtype=np.int64)
    enc = encode.run(None, {"text": text, "spk_embed": embed[None]})
    onnx_mel = ss.decode_mel(step, enc, text)  # (T, 80) ±4
    onnx_mel_t = onnx_mel.T  # (80, T)
    print(f"onnx tacotron mel {onnx_mel_t.shape}, range {onnx_mel_t.min():.2f}..{onnx_mel_t.max():.2f}")

    t_ref = ref_mel.shape[1]
    t_onnx = onnx_mel_t.shape[1]
    n = min(t_ref, t_onnx)
    d = float(np.abs(ref_mel[:, :n] - onnx_mel_t[:, :n]).max())
    corr = float(np.corrcoef(ref_mel[:, :n].ravel(), onnx_mel_t[:, :n].ravel())[0, 1])
    print(f"mel comparison over {n} frames: max |delta| {d:.3f}, pearson {corr:.4f}")

    # --- reference vocoder generate on the REFERENCE mel ---------------------
    model = ev.load_wavernn(HERE / "pretrained/vocoder.pt")
    t0 = time.time()
    ref_wav = model.generate(
        torch.from_numpy(ref_mel / 4.0)[None].float(),
        batched=False, target=8000, overlap=800, mu_law=True,
    )
    ref_wav = np.asarray(ref_wav, dtype=np.float32).ravel()
    print(f"reference wavernn: {len(ref_wav)/16000:.2f}s in {time.time()-t0:.0f}s, "
          f"peak {np.abs(ref_wav).max():.3f}, rms {float(np.sqrt((ref_wav**2).mean())):.4f}")
    ss._write_wav(HERE / "samples/gt-reference-full-pipeline.wav", ref_wav)

    # --- shipped onnx chunk on the REFERENCE mel (argmax) --------------------
    upsample = ort.InferenceSession(
        str(HERE / "export/voice-voc-upsample.onnx"), providers=["CPUExecutionProvider"])
    chunk = ort.InferenceSession(
        str(HERE / "export/voice-voc-chunk.onnx"), providers=["CPUExecutionProvider"])
    codes = ss.vocode(upsample, chunk, ref_mel.T.astype(np.float32), "argmax")
    print(f"onnx chunk on reference mel: unique classes {len(np.unique(codes))}, "
          f"mean {codes.mean():.1f}, min {codes.min():.0f}, max {codes.max():.0f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())