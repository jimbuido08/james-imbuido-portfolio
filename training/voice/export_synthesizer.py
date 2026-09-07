"""Milestone A throwaway: export the SV2TTS synthesizer (Tacotron) as two ONNX
graphs — a per-utterance encoder pass and a per-step decoder cell — because
`Tacotron.generate` is a Python loop with a data-dependent break: unrolled it is
a ~2000-step graph, i.e. not shippable. The JS-driven decoder-step design (the
plan's fallback, promoted to primary — see docs/notes/voice-cloning-architecture
.md §2) loops the step cell instead, which also buys real per-frame progress and
early exit.

Two deliberate, documented deviations from the reference repo:
- PreNet dropout stripped (the repo runs `F.dropout(training=True)` at inference
  on purpose); export is deterministic and ONNX-compatible.
- The postnet is not exported: the vocoder consumes the decoder's mels directly
  (`mels / 4`), so `generate()`'s postnet CBHG never needs to run.

Run on the Mac (see training/voice/README.md):
    python export_synthesizer.py --checkpoint pretrained/synthesizer.pt \
        --outdir export
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

RTVC = Path(__file__).resolve().parent / "_rtvc-src"
if not RTVC.is_dir():
    raise SystemExit(
        "reference repo missing — clone CorentinJ/Real-Time-Voice-Cloning to "
        f"{RTVC} (see README.md)"
    )
sys.path.insert(0, str(RTVC))

NUM_MELS = 80


class DeterministicPreNet(nn.Module):
    """Prenet without the reference repo's always-on inference dropout."""

    def __init__(self, prenet: nn.Module) -> None:
        super().__init__()
        self.fc1 = prenet.fc1
        self.fc2 = prenet.fc2

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        return F.relu(self.fc2(x))


class SynthEncode(nn.Module):
    """`text [1, T] int64, spk_embed [1, 256]` -> `(enc_seq [1, T, 512],
    enc_seq_proj [1, T, 128])`.

    Replicates Tacotron.encoder + encoder_proj without the in-place
    `transpose_` (tracing an in-place view op is avoidable risk) and without
    PreNet dropout."""

    def __init__(self, taco: nn.Module) -> None:
        super().__init__()
        self.embedding = taco.encoder.embedding
        self.pre_net = DeterministicPreNet(taco.encoder.pre_net)
        self.cbhg = taco.encoder.cbhg
        self.encoder_proj = taco.encoder_proj

    def add_speaker_embedding(self, x: torch.Tensor, spk: torch.Tensor) -> torch.Tensor:
        # Tacotron.Encoder.add_speaker_embedding for a 2D (batch, 256) input.
        batch_size, num_chars = x.size(0), x.size(1)
        e = spk.repeat_interleave(num_chars, dim=1)
        e = e.reshape(batch_size, spk.size(1), num_chars).transpose(1, 2)
        return torch.cat((x, e), 2)

    def forward(
        self, text: torch.Tensor, spk_embed: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        x = self.pre_net(self.embedding(text))
        x = x.transpose(1, 2)
        x = self.cbhg(x)
        x = self.add_speaker_embedding(x, spk_embed)
        return x, self.encoder_proj(x)


class SynthStep(nn.Module):
    """One decoder step (Tacotron.Decoder.forward with r = checkpoint's buffer).

    LSA's `cumulative`/`attention` buffers become loop-carried tensors; the
    encoder pass outputs feed in verbatim; zero-pad chars are masked exactly as
    in LSA.forward."""

    def __init__(self, taco: nn.Module, r: int) -> None:
        super().__init__()
        self.decoder = taco.decoder
        self.lsa = taco.decoder.attn_net
        self.r = int(r)  # checkpoint's reduction factor — baked into the graph

    def forward(
        self,
        enc_seq: torch.Tensor,  # [1, T, 512]
        enc_seq_proj: torch.Tensor,  # [1, T, 128]
        chars: torch.Tensor,  # [1, T] int64
        prenet_in: torch.Tensor,  # [1, 80]
        attn_h: torch.Tensor,  # [1, 128]
        rnn1_h: torch.Tensor,  # [1, 1024]
        rnn2_h: torch.Tensor,  # [1, 1024]
        rnn1_c: torch.Tensor,  # [1, 1024]
        rnn2_c: torch.Tensor,  # [1, 1024]
        context: torch.Tensor,  # [1, 512]
        cumulative: torch.Tensor,  # [1, T]
    ) -> tuple[torch.Tensor, ...]:
        d, lsa = self.decoder, self.lsa

        prenet_out = d.prenet(prenet_in)
        attn_hidden = d.attn_rnn(torch.cat([context, prenet_out], dim=-1), attn_h)

        # LSA.forward, unrolled from the module's stateful buffers.
        processed_query = lsa.W(attn_hidden).unsqueeze(1)
        location = cumulative.unsqueeze(1)
        processed_loc = lsa.L(lsa.conv(location).transpose(1, 2))
        u = lsa.v(torch.tanh(processed_query + enc_seq_proj + processed_loc))
        u = u.squeeze(-1)
        u = u * (chars != 0).float()
        scores = F.softmax(u, dim=1)

        context_vec = (scores.unsqueeze(1) @ enc_seq).squeeze(1)
        x = d.rnn_input(torch.cat([context_vec, attn_hidden], dim=1))
        rnn1_hidden_next, rnn1_cell_next = d.res_rnn1(x, (rnn1_h, rnn1_c))
        x = x + rnn1_hidden_next  # eval mode: no zoneout
        rnn2_hidden_next, rnn2_cell_next = d.res_rnn2(x, (rnn2_h, rnn2_c))
        x = x + rnn2_hidden_next

        mels = d.mel_proj(x).view(1, NUM_MELS, d.max_r)[:, :, : self.r]
        stop_tokens = torch.sigmoid(
            d.stop_proj(torch.cat((x, context_vec), dim=1))
        )

        return (
            mels,  # [1, 80, r]
            stop_tokens,  # [1, 1]
            attn_hidden,
            rnn1_hidden_next,
            rnn2_hidden_next,
            rnn1_cell_next,
            rnn2_cell_next,
            context_vec,
            cumulative + scores,  # next cumulative
            scores,  # next attention
        )


def load_tacotron(checkpoint_path: Path) -> nn.Module:
    from synthesizer.hparams import hparams
    from synthesizer.models.tacotron import Tacotron
    from synthesizer.utils.symbols import symbols

    model = Tacotron(
        embed_dims=hparams.tts_embed_dims,
        num_chars=len(symbols),
        encoder_dims=hparams.tts_encoder_dims,
        decoder_dims=hparams.tts_decoder_dims,
        n_mels=hparams.num_mels,
        fft_bins=hparams.num_mels,
        postnet_dims=hparams.tts_postnet_dims,
        encoder_K=hparams.tts_encoder_K,
        lstm_dims=hparams.tts_lstm_dims,
        postnet_K=hparams.tts_postnet_K,
        num_highways=hparams.tts_num_highways,
        dropout=hparams.tts_dropout,
        stop_threshold=hparams.tts_stop_threshold,
        speaker_embedding_size=hparams.speaker_embedding_size,
    )
    # weights_only=False: the checkpoint is a plain dict of tensors + ints.
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model


def merge_suffixed_inputs(out: Path) -> None:
    """The tracer emits duplicate `.1`-suffixed graph inputs for tensors that
    are consumed twice (loop-carried RNN state + residuals) — and sometimes
    drops the dot-free original entirely (all consumers reference the
    duplicate). Rewrite every dotted reference to its base name so the TS
    contract has one input per state."""
    import onnx

    model = onnx.load(str(out))
    graph = model.graph
    base_names = {i.name for i in graph.input if "." not in i.name}
    dotted = {
        i.name: i.name.split(".")[0] for i in graph.input if "." in i.name
    }
    if not dotted:
        return
    # A duplicate whose base already exists as its own graph input is dropped;
    # otherwise it is renamed to the (missing) base name.
    drop = {dup for dup, base in dotted.items() if base in base_names}
    for node in graph.node:
        for i, name in enumerate(node.input):
            if name in dotted:
                node.input[i] = dotted[name]
    keep = [
        (dotted[i.name] if i.name in dotted and i.name not in drop else i.name)
        for i in graph.input
        if i.name not in drop
    ]
    by_name = {i.name: i for i in graph.input}
    del graph.input[:]
    for name in keep:
        if name in by_name:
            graph.input.append(by_name[name])
        else:  # renamed duplicate: keep the original proto, new name
            dup = next(d for d, b in dotted.items() if b == name)
            proto = by_name[dup]
            proto.name = name
            graph.input.append(proto)
    onnx.save(model, str(out))
    print(f"[export] merged tracer duplicates: {', '.join(sorted(dotted))}")


def export_one(
    wrapper: nn.Module,
    dummy_args: tuple[torch.Tensor, ...],
    out: Path,
    input_names: list[str],
    output_names: list[str],
    feed: dict[str, "object"],
    expected_shapes: dict[str, tuple[int, ...]],
    dynamic_axes: dict[str, dict[int, str]] | None = None,
) -> None:
    import numpy as np
    import onnxruntime as ort

    torch.onnx.export(
        wrapper,
        dummy_args,
        str(out),
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        opset_version=17,
        dynamo=False,
    )
    merge_suffixed_inputs(out)
    session = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    feed = {
        k: v.detach().numpy() if torch.is_tensor(v) else v for k, v in feed.items()
    }
    results = session.run(None, feed)
    for name, result, expected in zip(output_names, results, expected_shapes.values()):
        assert list(result.shape) == list(expected), f"{name}: {result.shape}"
        assert np.isfinite(result).all(), f"{name}: non-finite"
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"[export] {out.name} ({size_mb:.2f} MB) verified")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--checkpoint", type=Path, required=True, help="pretrained/synthesizer.pt"
    )
    parser.add_argument("--outdir", type=Path, required=True)
    parser.add_argument(
        "--text-len", type=int, default=50, help="dummy text length for tracing"
    )
    args = parser.parse_args()

    taco = load_tacotron(args.checkpoint)
    r = int(taco.decoder.r.item())
    print(f"[export] checkpoint reduction factor r = {r}")
    args.outdir.mkdir(parents=True, exist_ok=True)

    # Strip always-on inference dropout from both Prenets (documented deviation).
    taco.encoder.pre_net = DeterministicPreNet(taco.encoder.pre_net)
    taco.decoder.prenet = DeterministicPreNet(taco.decoder.prenet)

    t = args.text_len
    spk_embed = torch.zeros(1, 256)
    text = torch.zeros(1, t, dtype=torch.int64)

    encode = SynthEncode(taco).eval()
    export_one(
        encode,
        (text, spk_embed),
        args.outdir / "voice-synth-encode.onnx",
        ["text", "spk_embed"],
        ["enc_seq", "enc_seq_proj"],
        {
            "text": text.numpy(),
            "spk_embed": spk_embed.numpy(),
        },
        {
            "enc_seq": (1, t, 512),
            "enc_seq_proj": (1, t, 128),
        },
        # T (text length) is dynamic: JS runs arbitrary utterance lengths.
        dynamic_axes={
            "text": {1: "T"},
            "enc_seq": {1: "T"},
            "enc_seq_proj": {1: "T"},
        },
    )

    step = SynthStep(taco, r).eval()
    dummy = {
        "enc_seq": torch.zeros(1, t, 512),
        "enc_seq_proj": torch.zeros(1, t, 128),
        "chars": text,
        "prenet_in": torch.zeros(1, NUM_MELS),
        "attn_h": torch.zeros(1, 128),
        "rnn1_h": torch.zeros(1, 1024),
        "rnn2_h": torch.zeros(1, 1024),
        "rnn1_c": torch.zeros(1, 1024),
        "rnn2_c": torch.zeros(1, 1024),
        "context": torch.zeros(1, 512),
        "cumulative": torch.zeros(1, t),
    }
    export_one(
        step,
        tuple(dummy.values()),
        args.outdir / "voice-synth-step.onnx",
        list(dummy.keys()),
        # Outputs carry the next-step states; the "next_" prefix keeps them
        # distinct from the loop-carried input names (the exporter renames the
        # producing nodes to these names, so a shared name would collide with
        # the merged inputs).
        [
            "mel",
            "stop",
            "next_attn_h",
            "next_rnn1_h",
            "next_rnn2_h",
            "next_rnn1_c",
            "next_rnn2_c",
            "next_context",
            "next_cumulative",
            "attention",
        ],
        dummy,
        {
            "mel": (1, NUM_MELS, r),
            "stop": (1, 1),
            "next_attn_h": (1, 128),
            "next_rnn1_h": (1, 1024),
            "next_rnn2_h": (1, 1024),
            "next_rnn1_c": (1, 1024),
            "next_rnn2_c": (1, 1024),
            "next_context": (1, 512),
            "next_cumulative": (1, t),
            "attention": (1, t),
        },
        dynamic_axes={
            "enc_seq": {1: "T"},
            "enc_seq_proj": {1: "T"},
            "chars": {1: "T"},
            "cumulative": {1: "T"},
            "next_cumulative": {1: "T"},
            "attention": {1: "T"},
        },
    )
    print(f"[export] done — r = {r} baked into voice-synth-step.onnx (JS appends "
          f"{r} mel frames per step)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())