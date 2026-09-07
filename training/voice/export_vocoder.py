"""Milestone A throwaway: export the SV2TTS vocoder (WaveRNN, fatchord_version)
as two ONNX graphs — a parallel whole-sequence conditioning pass and a
single-sample step cell — because WaveRNN's `generate` samples with
`torch.distributions.Categorical` (not exportable) and loops per sample in
Python. Sampling (seeded in TS; argmax for fixtures) and the sample loop live
in JS; the graph carries only tensor state (h1/h2 — WaveRNN has no conv state
across steps). See docs/notes/voice-cloning-architecture.md §2.

Run on the Mac (see training/voice/README.md):
    python export_vocoder.py --checkpoint pretrained/vocoder.pt --outdir export
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

# numpy >= 2 removed the alias the reference repo uses for the upsample scale.
import numpy as _np

if not hasattr(_np, "cumproduct"):
    _np.cumproduct = _np.cumprod  # type: ignore[attr-defined]

RTVC = Path(__file__).resolve().parent / "_rtvc-src"
if not RTVC.is_dir():
    raise SystemExit(
        "reference repo missing — clone CorentinJ/Real-Time-Voice-Cloning to "
        f"{RTVC} (see README.md)"
    )
sys.path.insert(0, str(RTVC))

NUM_MELS = 80  # synthesizer hparams.num_mels (shared with vocoder)
AUX_DIMS = 32  # res_out_dims 128 // 4


class VocUpsample(nn.Module):
    """`mel [1, 80, T]` (normalised mels / 4) -> `(mels_cond [1, 200T, 80],
    aux [1, 200T, 128])`.

    Replicates WaveRNN.generate's conditioning precompute: pad both sides by
    voc_pad = 2, run UpsampleNetwork once (fully parallel). The upsampler's
    internal [indent:-indent] slice yields exactly 200T rows."""

    def __init__(self, upsample: nn.Module, pad: int) -> None:
        super().__init__()
        self.upsample = upsample
        self.pad = pad

    def forward(self, mel: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        mels, aux = self.upsample(F.pad(mel, (self.pad, self.pad)))
        return mels, aux


class VocStep(nn.Module):
    """One WaveRNN sample: `x_prev [1, 1], m_t [1, 80], a1..a4 [1, 32],
    h1/h2 [1, 512]` -> `logits [1, 512], h1', h2'`.

    Replicates the per-sample body of WaveRNN.generate (RAW mode), with the two
    nn.GRUs used as GRUCells (same weights, get_gru_cell-style) and sampling
    left to JS."""

    def __init__(self, wavernn: nn.Module) -> None:
        super().__init__()
        self.I = wavernn.I
        self.fc1 = wavernn.fc1
        self.fc2 = wavernn.fc2
        self.fc3 = wavernn.fc3
        self.rnn1 = nn.GRUCell(wavernn.rnn1.input_size, wavernn.rnn1.hidden_size)
        self.rnn1.weight_ih.data = wavernn.rnn1.weight_ih_l0.data
        self.rnn1.weight_hh.data = wavernn.rnn1.weight_hh_l0.data
        self.rnn1.bias_ih.data = wavernn.rnn1.bias_ih_l0.data
        self.rnn1.bias_hh.data = wavernn.rnn1.bias_hh_l0.data
        self.rnn2 = nn.GRUCell(wavernn.rnn2.input_size, wavernn.rnn2.hidden_size)
        self.rnn2.weight_ih.data = wavernn.rnn2.weight_ih_l0.data
        self.rnn2.weight_hh.data = wavernn.rnn2.weight_hh_l0.data
        self.rnn2.bias_ih.data = wavernn.rnn2.bias_ih_l0.data
        self.rnn2.bias_hh.data = wavernn.rnn2.bias_hh_l0.data

    def forward(
        self,
        x_prev: torch.Tensor,  # [1, 1] previous sample, in [-1, 1]
        m_t: torch.Tensor,  # [1, 80]
        a1: torch.Tensor,  # [1, 32]
        a2: torch.Tensor,  # [1, 32]
        a3: torch.Tensor,  # [1, 32]
        a4: torch.Tensor,  # [1, 32]
        h1: torch.Tensor,  # [1, 512]
        h2: torch.Tensor,  # [1, 512]
    ) -> torch.Tensor:
        x = self.I(torch.cat([x_prev, m_t, a1], dim=1))
        res = x
        x = self.rnn1(x, h1)  # GRUCell returns the hidden state only
        x = x + res
        res = x
        x = self.rnn2(torch.cat([x, a2], dim=1), h2)
        x = x + res
        x = F.relu(self.fc1(torch.cat([x, a3], dim=1)))
        x = F.relu(self.fc2(torch.cat([x, a4], dim=1)))
        return self.fc3(x)


class VocChunk(nn.Module):
    """One full mel frame: SAMPLES unrolled WaveRNN steps in a single graph run.

    The per-sample JS loop measures 0.4 ms/sample in wasm — mostly JS<->wasm
    run overhead, 64k runs per second of audio. Unrolling one mel frame (200
    samples, the vocoder's constant conditioning length) into one run amortises
    that overhead 200x: 320 runs per 4 s of audio.

    Sampling happens in-graph (the JS loop can no longer interleave): JS seeds
    `u` ~ Uniform[0, 1) per sample; the gumbel-max trick
    argmax(logits + -log(-log(u))) samples exactly from the categorical. For
    deterministic fixtures pass u = 0.5 (constant shift, argmax preserved).
    """

    def __init__(self, step: VocStep, samples: int) -> None:
        super().__init__()
        self.step = step
        self.samples = samples

    def forward(
        self,
        x_prev: torch.Tensor,  # [1, 1]
        m_t: torch.Tensor,  # [1, 80] constant across the frame
        a1: torch.Tensor,  # [1, 32]
        a2: torch.Tensor,  # [1, 32]
        a3: torch.Tensor,  # [1, 32]
        a4: torch.Tensor,  # [1, 32]
        h1: torch.Tensor,  # [1, 512]
        h2: torch.Tensor,  # [1, 512]
        u: torch.Tensor,  # [samples] uniforms in (0, 1)
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        ys = []
        for i in range(self.samples):
            logits = self.step(x_prev, m_t, a1, a2, a3, a4, h1, h2)
            gumbel = -torch.log(-torch.log(u[i]).clamp_min(1e-10)).clamp_min(1e-10)
            y = torch.argmax(logits + gumbel, dim=1, keepdim=True)
            ys.append(y)
            x_prev = y.to(torch.float32) / 511.0 * 2.0 - 1.0
        return torch.cat(ys, dim=1).to(torch.float32), h1, h2, x_prev


def load_wavernn(checkpoint_path: Path) -> nn.Module:
    from vocoder import hparams as hp
    from vocoder.models.fatchord_version import WaveRNN

    model = WaveRNN(
        rnn_dims=hp.voc_rnn_dims,
        fc_dims=hp.voc_fc_dims,
        bits=hp.bits,
        pad=hp.voc_pad,
        upsample_factors=hp.voc_upsample_factors,
        feat_dims=hp.num_mels,
        compute_dims=hp.voc_compute_dims,
        res_out_dims=hp.voc_res_out_dims,
        res_blocks=hp.voc_res_blocks,
        hop_length=hp.hop_length,
        sample_rate=hp.sample_rate,
        mode=hp.voc_mode,
    )
    # weights_only=False: the checkpoint is a plain dict of tensors + ints.
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model


def verify(out: Path, feed: dict[str, "object"]) -> None:
    import numpy as np
    import onnxruntime as ort

    session = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    results = session.run(None, feed)
    for result in results:
        assert np.isfinite(result).all()
    print(f"[export] {out.name} ({out.stat().st_size / 1024 / 1024:.2f} MB) verified")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoint", type=Path, required=True, help="pretrained/vocoder.pt"
    )
    parser.add_argument("--outdir", type=Path, required=True)
    parser.add_argument("--mel-frames", type=int, default=32, help="dummy mel length")
    args = parser.parse_args()

    from vocoder import hparams as hp

    import onnxruntime as ort

    model = load_wavernn(args.checkpoint)
    args.outdir.mkdir(parents=True, exist_ok=True)

    t = args.mel_frames
    upsample = VocUpsample(model.upsample, model.pad).eval()
    dummy_mel = torch.zeros(1, NUM_MELS, t)
    torch.onnx.export(
        upsample,
        (dummy_mel,),
        str(args.outdir / "voice-voc-upsample.onnx"),
        input_names=["mel"],
        output_names=["mels_cond", "aux"],
        opset_version=17,
        dynamo=False,
    )
    verify(
        args.outdir / "voice-voc-upsample.onnx",
        {"mel": dummy_mel.numpy()},
    )
    # The upsampled length must be exactly hop_length * T — JS slices rows per
    # sample index from this pair.
    import onnxruntime as ort

    session = ort.InferenceSession(
        str(args.outdir / "voice-voc-upsample.onnx"),
        providers=["CPUExecutionProvider"],
    )
    mels_cond, aux = session.run(None, {"mel": dummy_mel.numpy()})
    total_scale = int(torch.cumprod(torch.tensor(hp.voc_upsample_factors), 0)[-1])
    assert mels_cond.shape == (1, t * total_scale, NUM_MELS), mels_cond.shape
    assert aux.shape == (1, t * total_scale, hp.voc_res_out_dims), aux.shape

    step = VocStep(model).eval()
    dummy = {
        "x_prev": torch.zeros(1, 1),
        "m_t": torch.zeros(1, NUM_MELS),
        "a1": torch.zeros(1, 32),
        "a2": torch.zeros(1, 32),
        "a3": torch.zeros(1, 32),
        "a4": torch.zeros(1, 32),
        "h1": torch.zeros(1, hp.voc_rnn_dims),
        "h2": torch.zeros(1, hp.voc_rnn_dims),
    }
    torch.onnx.export(
        step,
        tuple(dummy.values()),
        str(args.outdir / "voice-voc-step.onnx"),
        input_names=list(dummy.keys()),
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
    )
    verify(args.outdir / "voice-voc-step.onnx", {k: v.numpy() for k, v in dummy.items()})
    step_session = ort.InferenceSession(
        str(args.outdir / "voice-voc-step.onnx"),
        providers=["CPUExecutionProvider"],
    )
    out = step_session.run(None, {k: v.numpy() for k, v in dummy.items()})[0]
    n_classes = 2 ** hp.bits
    assert out.shape == (1, n_classes), out.shape

    # The shippable vocoder form: one full mel frame per run. total_scale
    # samples per frame (upsample factors product), noise fed by JS.
    chunk = VocChunk(step, total_scale).eval()
    chunk_dummy = dict(dummy)
    chunk_dummy["u"] = torch.full((total_scale,), 0.5)
    torch.onnx.export(
        chunk,
        tuple(chunk_dummy.values()),
        str(args.outdir / "voice-voc-chunk.onnx"),
        input_names=list(chunk_dummy.keys()),
        output_names=["samples", "next_h1", "next_h2", "next_x_prev"],
        opset_version=17,
        dynamo=False,
    )
    chunk_session = ort.InferenceSession(
        str(args.outdir / "voice-voc-chunk.onnx"),
        providers=["CPUExecutionProvider"],
    )
    chunk_feed = {k: v.numpy() for k, v in chunk_dummy.items()}
    samples, nh1, nh2, nx = chunk_session.run(None, chunk_feed)
    import numpy as _np

    assert samples.shape == (1, total_scale), samples.shape
    assert _np.isfinite(samples).all()
    print(f"[export] voice-voc-chunk.onnx verified — {total_scale} samples/run, "
          f"argmax path (u=0.5) all-same check: {samples[0][0]:.0f}")

    print(f"[export] done — {n_classes}-class RAW logits per step; "
          "sampling, mu-law decode and de-emphasis live in TS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())