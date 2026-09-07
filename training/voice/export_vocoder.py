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
    left to JS. The updated hidden states are returned alongside the logits —
    WaveRNN.generate carries h1/h2 across every sample, so a step cell that
    dropped them would freeze the recurrent state (the bug that produced
    constant class-0 output in the first export)."""

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
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        x = self.I(torch.cat([x_prev, m_t, a1], dim=1))
        res = x
        h1 = self.rnn1(x, h1)  # GRUCell returns the hidden state only
        x = h1 + res
        res = x
        h2 = self.rnn2(torch.cat([x, a2], dim=1), h2)
        x = h2 + res
        x = F.relu(self.fc1(torch.cat([x, a3], dim=1)))
        x = F.relu(self.fc2(torch.cat([x, a4], dim=1)))
        return self.fc3(x), h1, h2


class VocChunk(nn.Module):
    """One full mel frame: SAMPLES unrolled WaveRNN steps in a single graph run.

    The per-sample JS loop measures 0.4 ms/sample in wasm — mostly JS<->wasm
    run overhead, 64k runs per second of audio. Unrolling one mel frame (200
    samples, the conditioning slice length) into one run amortises that
    overhead 200x: 320 runs per 4 s of audio.

    Conditioning is per-sample exactly as in WaveRNN.generate: the frame's
    slice of the upsampled pair — mels [200, 80] and aux [200, 128] — feeds
    row i to step i (a1..a4 are aux row slices [i*32:(i+1)*32]).

    Sampling happens in-graph (the JS loop can no longer interleave): JS seeds
    `u` ~ Uniform[0, 1) per (sample, class); the gumbel-max trick
    argmax(logits + -log(-log(u))) samples exactly from the categorical. The
    noise MUST be independent per class — a single scalar per sample adds a
    constant to all 512 logits and argmax(logits + const) == argmax(logits),
    i.e. pure argmax masquerading as sampling (the bug that shipped first).
    For deterministic fixtures pass u = 0.5 everywhere (constant vector,
    argmax preserved).
    """

    def __init__(self, step: VocStep, samples: int) -> None:
        super().__init__()
        self.step = step
        self.samples = samples
        self.n_classes = step.fc3.out_features

    def forward(
        self,
        x_prev: torch.Tensor,  # [1, 1]
        mels: torch.Tensor,  # [samples, 80] per-sample conditioning
        aux: torch.Tensor,  # [samples, 128]
        h1: torch.Tensor,  # [1, 512]
        h2: torch.Tensor,  # [1, 512]
        u: torch.Tensor,  # [samples, n_classes] uniforms in (0, 1)
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        ys = []
        a1, a2, a3, a4 = (
            aux[:, i * 32 : (i + 1) * 32] for i in range(4)
        )
        for i in range(self.samples):
            logits, h1, h2 = self.step(
                x_prev, mels[i : i + 1], a1[i : i + 1],
                a2[i : i + 1], a3[i : i + 1], a4[i : i + 1],
                h1, h2,
            )
            # Per-class gumbel noise: g_c = -log(-log(u_c)), u_c ~ U(0,1)
            # independent per class. Clamp the INNER -log(u) (positive,
            # guards u == 1); never clamp the outer value — the gumbel is
            # legitimately negative for u > 1/e.
            inner = (-torch.log(u[i])).clamp_min(1e-10)
            gumbel = -torch.log(inner)
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


def verify(
    out: Path,
    feed: dict[str, "object"],
    wrapper: "torch.nn.Module | None" = None,
    torch_args: "tuple | None" = None,
) -> None:
    """Run the export through ORT; when a PyTorch wrapper is given, also check
    numeric parity on the same inputs (mandatory after graph surgery)."""
    import numpy as np
    import onnxruntime as ort

    session = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    results = session.run(None, feed)
    for result in results:
        assert np.isfinite(result).all()
    if wrapper is not None and torch_args is not None:
        with torch.no_grad():
            reference = wrapper(*torch_args)
        if not isinstance(reference, tuple):
            reference = (reference,)
        worst = max(
            float(np.abs(r - ref.detach().numpy()).max())
            for r, ref in zip(results, reference)
        )
        assert worst < 2e-3, f"PyTorch vs ONNX max |delta| {worst}"
        print(
            f"[export] {out.name} ({out.stat().st_size / 1024 / 1024:.2f} MB) "
            f"verified, PyTorch parity max |delta| = {worst:.2e}"
        )
        return
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
    torch.manual_seed(20260906)
    # Seeded random mel: zeros would make the PyTorch-vs-ONNX parity check
    # degenerate (and the argmax path trivial).
    dummy_mel = torch.randn(1, NUM_MELS, t)
    torch.onnx.export(
        upsample,
        (dummy_mel,),
        str(args.outdir / "voice-voc-upsample.onnx"),
        input_names=["mel"],
        output_names=["mels_cond", "aux"],
        # T (mel frames) is dynamic: JS vocodes arbitrary utterance lengths.
        dynamic_axes={
            "mel": {2: "T"},
            "mels_cond": {1: "S"},
            "aux": {1: "S"},
        },
        opset_version=17,
        dynamo=False,
    )
    verify(
        args.outdir / "voice-voc-upsample.onnx",
        {"mel": dummy_mel.numpy()},
        wrapper=upsample,
        torch_args=(dummy_mel,),
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
    # The T axis must be dynamic — a different length runs identically.
    alt = session.run(None, {"mel": dummy_mel[:, :, : t // 2].numpy()})
    assert alt[0].shape == (1, (t // 2) * total_scale, NUM_MELS), alt[0].shape
    print(f"[export] voc-upsample dynamic-T check ok (T={t // 2})")

    step = VocStep(model).eval()
    dummy = {
        "x_prev": torch.zeros(1, 1),
        "m_t": torch.randn(1, NUM_MELS),
        "a1": torch.randn(1, 32),
        "a2": torch.randn(1, 32),
        "a3": torch.randn(1, 32),
        "a4": torch.randn(1, 32),
        "h1": torch.randn(1, hp.voc_rnn_dims) * 0.1,
        "h2": torch.randn(1, hp.voc_rnn_dims) * 0.1,
    }
    torch.onnx.export(
        step,
        tuple(dummy.values()),
        str(args.outdir / "voice-voc-step.onnx"),
        input_names=list(dummy.keys()),
        output_names=["logits", "next_h1", "next_h2"],
        opset_version=17,
        dynamo=False,
    )
    verify(
        args.outdir / "voice-voc-step.onnx",
        {k: v.numpy() for k, v in dummy.items()},
        wrapper=step,
        torch_args=tuple(dummy.values()),
    )
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
    chunk_dummy = {
        "x_prev": torch.zeros(1, 1),
        "mels": torch.randn(total_scale, NUM_MELS),
        "aux": torch.randn(total_scale, hp.voc_res_out_dims),
        "h1": torch.randn(1, hp.voc_rnn_dims) * 0.1,
        "h2": torch.randn(1, hp.voc_rnn_dims) * 0.1,
        # u = 0.5 everywhere -> constant per-class gumbel vector -> argmax
        # path (deterministic, fixture-friendly). JS feeds real uniforms.
        "u": torch.full((total_scale, n_classes), 0.5),
    }
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
    with torch.no_grad():
        ref_samples, ref_h1, ref_h2, ref_x = chunk(*chunk_dummy.values())
    delta = float(_np.abs(samples - ref_samples.numpy()).max())
    assert delta < 2e-3, f"PyTorch vs ONNX chunk max |delta| {delta}"
    # Degeneracy guards — the first export shipped a graph whose gumbel term
    # was NaN (clamp before unary minus), so argmax always returned class 0
    # and every downstream "sample" was the same DC value. Parity passed
    # because both sides computed the same NaN. Never let a constant-output
    # chunk through again.
    assert _np.unique(samples).size > total_scale // 2, (
        f"chunk degenerate: only {_np.unique(samples).size} distinct classes "
        f"across {total_scale} samples — gumbel/argmax is broken"
    )
    assert not _np.isnan(ref_samples.numpy()).any(), "wrapper chunk produced NaN"
    # u-sensitivity: a different draw must change the samples. The first
    # export's gumbel was a per-sample SCALAR (constant across the 512 class
    # logits — a no-op for argmax), so random-u output equalled argmax-u.
    rand_u = torch.rand(total_scale, n_classes) * 0.998 + 0.001
    with torch.no_grad():
        ref_rand, _, _, _ = chunk(*(
            rand_u if k == "u" else v for k, v in chunk_dummy.items()
        ))
    assert not torch.equal(ref_samples, ref_rand), (
        "chunk is u-insensitive — gumbel noise is not per-class"
    )
    print(f"[export] voice-voc-chunk.onnx parity max |delta| = {delta:.2e}, "
          f"distinct classes {_np.unique(samples).size}/{total_scale}, "
          "u-sensitive: yes")

    print(f"[export] done — {n_classes}-class RAW logits per step; "
          "sampling, mu-law decode and de-emphasis live in TS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())