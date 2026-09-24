"""numpy (float64) mirror of the STOR container reader + the storyteller forward pass.

Fixtures are generated from THIS mirror, not torch — so cross-language
differences against the TypeScript port stay in kernel order only
(the llm-lab reference.py precedent). The mirror reads the SHIPPED fp16
container, so every fixture value derives from the exact bytes the browser
loads, never an fp32 master.

Run on James's machine — never on Vercel (same venv as export.py).
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MAGIC = b"STOR"
VERSION = 1
DTYPE_FP16 = 1
RMS_EPS = 1e-6
ROPE_BASE = 10_000.0


@dataclass
class StorytellerConfig:
    n_layer: int
    n_embd: int
    n_head: int
    ctx_len: int
    vocab_size: int

    @property
    def head_dim(self) -> int:
        assert self.n_embd % self.n_head == 0
        return self.n_embd // self.n_head

    @property
    def hidden(self) -> int:
        return (int(self.n_embd * 8 / 3) + 63) // 64 * 64


def load_container(path: Path) -> tuple[StorytellerConfig, dict[str, np.ndarray], dict]:
    raw = Path(path).read_bytes()
    (
        magic, version, dtype, flags,
        n_embd, n_layer, n_head, ctx_len, vocab,
        param_count, crc, payload_bytes, _reserved,
    ) = struct.unpack("<4sHBBHBBHHIIII", raw[:32])
    assert magic == MAGIC, f"bad magic {magic!r}"
    assert version == VERSION, f"bad version {version}"
    assert dtype == DTYPE_FP16, f"bad dtype {dtype}"
    assert flags & 0b01, "untied head — v1 is always tied"
    payload = raw[32 : 32 + payload_bytes]
    assert len(raw) == 32 + payload_bytes, "truncated container"
    assert (zlib.crc32(payload) & 0xFFFFFFFF) == crc, "crc32 mismatch"

    cfg = StorytellerConfig(n_layer, n_embd, n_head, ctx_len, vocab)
    f64 = np.frombuffer(payload, dtype="<f2").astype(np.float64)  # fp16 -> f64 is exact
    assert f64.size == param_count, f"{f64.size} params != header {param_count}"

    d, hidden = cfg.n_embd, cfg.hidden
    order: list[tuple[str, tuple[int, ...]]] = [("wte.weight", (vocab, d))]
    for i in range(cfg.n_layer):
        order += [
            (f"h.{i}.ln1.weight", (d,)),
            (f"h.{i}.attn.qkv.weight", (3 * d, d)),
            (f"h.{i}.attn.proj.weight", (d, d)),
            (f"h.{i}.ln2.weight", (d,)),
            (f"h.{i}.ffn.w1.weight", (hidden, d)),
            (f"h.{i}.ffn.w3.weight", (hidden, d)),
            (f"h.{i}.ffn.w2.weight", (d, hidden)),
        ]
    order.append(("norm_f.weight", (d,)))

    weights, pos = {}, 0
    for key, shape in order:
        n = int(np.prod(shape))
        weights[key] = f64[pos : pos + n].reshape(shape)
        pos += n
    assert pos == param_count

    header = {
        "version": version, "dtype": dtype, "flags": flags,
        "n_embd": n_embd, "n_layer": n_layer, "n_head": n_head,
        "ctx_len": ctx_len, "vocab_size": vocab,
        "paramCount": param_count, "crc32": crc, "payloadBytes": payload_bytes,
    }
    return cfg, weights, header


def rope_tables(head_dim: int, ctx_len: int) -> tuple[np.ndarray, np.ndarray]:
    """cos/sin tables [ctx_len, head_dim // 2] for interleaved-pair RoPE."""
    inv_freq = 1.0 / (ROPE_BASE ** (np.arange(0, head_dim, 2, dtype=np.float64) / head_dim))
    freqs = np.outer(np.arange(ctx_len, dtype=np.float64), inv_freq)
    return np.cos(freqs), np.sin(freqs)


def _rope_apply(x: np.ndarray, cos: np.ndarray, sin: np.ndarray) -> np.ndarray:
    """x: [T, D] single head — rotates interleaved pairs (x[2i], x[2i+1])."""
    x1, x2 = x[:, 0::2], x[:, 1::2]
    rotated = np.stack((x1 * cos - x2 * sin, x1 * sin + x2 * cos), axis=-1)
    return rotated.reshape(x.shape)


def _rmsnorm(x: np.ndarray, weight: np.ndarray) -> np.ndarray:
    rms = 1.0 / np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + RMS_EPS)
    return x * rms * weight


def _silu(x: np.ndarray) -> np.ndarray:
    return x / (1.0 + np.exp(-x))


def forward_last_logits(
    cfg: StorytellerConfig,
    w: dict[str, np.ndarray],
    ids: list[int],
) -> np.ndarray:
    """Full forward, returning the LAST position's logits (tied head)."""
    assert len(ids) <= cfg.ctx_len and len(ids) >= 1
    d, hd, hidden = cfg.n_embd, cfg.head_dim, cfg.hidden
    cos, sin = rope_tables(hd, len(ids))
    cos_full, sin_full = rope_tables(hd, cfg.ctx_len)

    x = w["wte.weight"][np.asarray(ids, dtype=np.int64)]  # [T, d]
    T = x.shape[0]
    mask = np.triu(np.full((T, T), -np.inf), k=1)
    scale = 1.0 / np.sqrt(hd)

    for i in range(cfg.n_layer):
        h = _rmsnorm(x, w[f"h.{i}.ln1.weight"])
        qkv = h @ w[f"h.{i}.attn.qkv.weight"].T  # [T, 3d]
        q, k, v = qkv[:, :d], qkv[:, d : 2 * d], qkv[:, 2 * d :]
        heads = []
        for hh in range(cfg.n_head):
            sl = slice(hh * hd, (hh + 1) * hd)
            qh = _rope_apply(q[:, sl], cos, sin)
            kh = _rope_apply(k[:, sl], cos, sin)
            vh = v[:, sl]
            scores = (qh @ kh.T) * scale + mask
            scores -= scores.max(axis=-1, keepdims=True)
            p = np.exp(scores)
            p /= p.sum(axis=-1, keepdims=True)
            heads.append(p @ vh)
        attn = np.concatenate(heads, axis=-1) @ w[f"h.{i}.attn.proj.weight"].T
        x = x + attn

        h2 = _rmsnorm(x, w[f"h.{i}.ln2.weight"])
        gate = _silu(h2 @ w[f"h.{i}.ffn.w1.weight"].T)
        up = h2 @ w[f"h.{i}.ffn.w3.weight"].T
        x = x + (gate * up) @ w[f"h.{i}.ffn.w2.weight"].T

    x = _rmsnorm(x[-1], w["norm_f.weight"])
    return x @ w["wte.weight"].T  # tied head


def greedy_continuation(
    cfg: StorytellerConfig,
    w: dict[str, np.ndarray],
    ids: list[int],
    n: int,
) -> list[int]:
    ids = list(ids)
    for _ in range(n):
        window = ids[-cfg.ctx_len :]
        logits = forward_last_logits(cfg, w, window)
        ids.append(int(np.argmax(logits)))
    return ids