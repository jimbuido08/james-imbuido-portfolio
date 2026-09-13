#!/usr/bin/env python3
"""Numpy mirror of the LLM Lab math core (lib/llm/).

This is the "second language" of the contract, in the chess encode.py ↔
modelEncoding.ts pattern: the shipped runtime is TypeScript, and this file
exists to (a) independently verify the TS forward pass and — more valuable —
the TS backward pass against machine-generated golden fixtures, and (b)
read/write the JLLM v1 artifact container for offline sanity checks.

Change this file together with lib/llm/{config,model,kernels,backward,adam,
artifact}.ts AND regenerate the fixtures (`make_fixtures.py`) — the verify
gate (`npm run verify:llm-model`) enforces agreement.

Machine-local only; never runs on Vercel.

Numeric policy: computation here is float64 throughout (numpy), matching the
TS dot-product kernels' float64 accumulation; TS's float32 rank-1-update
kernels differ only within the gate tolerances (abs 1e-5 / rel 1e-3 on
5-significant-digit fixture values). The PRNG and Box-Muller streams are
mirrored bit-exactly (the gate checks them exactly), including the u clamp
and pair-consumption order.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass

import numpy as np

# ---- int32/float helpers mirroring JS bitwise semantics ---------------------


def _i32(x: int) -> int:
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x >= 0x80000000 else x


def _u32(x: int) -> int:
    return x & 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """Math.imul: 32-bit signed multiply, lower 32 bits."""
    return _i32((_u32(a) * _u32(b)) & 0xFFFFFFFF)


def mulberry32(seed: int):
    """Mirror of lib/llm/prng.ts mulberry32 (same stream)."""
    state = _u32(seed)

    def rng() -> float:
        nonlocal state
        state = _i32(state + 0x6D2B79F5)
        t = state
        t = _imul(t ^ _u32(t) >> 15, t | 1)
        t = _i32(t ^ _i32(t + _imul(t ^ _u32(t) >> 7, t | 61)))
        return _u32(t ^ (_u32(t) >> 14)) / 4294967296.0

    return rng


def normal_sampler(rng):
    """Mirror of lib/llm/prng.ts normalSampler (Box-Muller, clamp 1e-12)."""
    spare: list[float] = []

    def nxt() -> float:
        if spare:
            return spare.pop()
        u1 = max(rng(), 1e-12)
        u2 = rng()
        import math

        radius = math.sqrt(-2.0 * math.log(u1))
        angle = 2.0 * math.pi * u2
        spare.append(radius * math.sin(angle))
        return radius * math.cos(angle)

    return nxt


# ---- config / layout (mirror of lib/llm/config.ts + model.ts buildLayout) ---


@dataclass(frozen=True)
class MicroConfig:
    d: int = 16
    n_layer: int = 2
    n_head: int = 2
    ctx: int = 8
    vocab: int = 256

    @property
    def params(self) -> int:
        d = self.d
        return self.vocab * d + self.ctx * d + self.n_layer * (12 * d * d + 13 * d) + 2 * d


MICRO = MicroConfig()
INIT_STD = 0.02
LN_EPS = 1e-5
GELU_C = 0.7978845608028654  # sqrt(2/pi)

# Fixed layout order (== artifact payload order == TS buildLayout order).
LAYER_ORDER = [
    ("ln1g", "d"), ("ln1b", "d"), ("wqkv", "3dd"), ("bqkv", "3d"),
    ("wo", "dd"), ("bo", "d"), ("ln2g", "d"), ("ln2b", "d"),
    ("w1", "4dd"), ("b1", "4d"), ("w2", "d4d"), ("b2", "d"),
]


def layout_sizes(c: MicroConfig) -> list[tuple[str, int]]:
    d = c.d
    dims = {
        "d": d, "3dd": 3 * d * d, "3d": 3 * d, "dd": d * d,
        "4dd": 4 * d * d, "4d": 4 * d, "d4d": d * 4 * d,
    }
    order: list[tuple[str, int]] = [("wte", c.vocab * d), ("wpe", c.ctx * d)]
    for l in range(c.n_layer):
        for name, dim in LAYER_ORDER:
            order.append((f"l{l}.{name}", dims[dim]))
    order += [("lnfg", d), ("lnfb", d)]
    return order


def split_weights(flat: np.ndarray, c: MicroConfig) -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {}
    off = 0
    for name, n in layout_sizes(c):
        out[name] = flat[off : off + n]
        off += n
    assert off == c.params, f"layout total {off} != params {c.params}"
    return out


def init_flat(c: MicroConfig, seed: int) -> np.ndarray:
    """Mirror of model.ts initWeights — same stream, same fill order, f32."""
    rng = normal_sampler(mulberry32(seed))
    residual_std = INIT_STD / np.sqrt(2 * c.n_layer)
    parts: list[np.ndarray] = []
    for name, n in layout_sizes(c):
        short = name.split(".")[-1]
        if short.startswith("ln") and short.endswith("g"):
            parts.append(np.ones(n))
        elif short.endswith("b") or short in ("bqkv", "bo", "b1", "b2"):
            parts.append(np.zeros(n))
        else:
            std = residual_std if short in ("wo", "w2") else INIT_STD
            draws = np.array([std * rng() for _ in range(n)], dtype=np.float64)
            parts.append(draws)
    return np.concatenate(parts).astype(np.float32)


# ---- forward ---------------------------------------------------------------


def _ln(x: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    mean = x.mean(axis=-1, keepdims=True)
    var = ((x - mean) ** 2).mean(axis=-1, keepdims=True)
    inv = 1.0 / np.sqrt(var + LN_EPS)
    return (x - mean) * inv * g + b


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(GELU_C * (x + 0.044715 * x**3)))


def _softmax_rows(a: np.ndarray) -> np.ndarray:
    a = a - a.max(axis=-1, keepdims=True)
    e = np.exp(a)
    return e / e.sum(axis=-1, keepdims=True)


def forward(w: dict[str, np.ndarray], c: MicroConfig, ids: np.ndarray, targets: np.ndarray | None):
    """ids/targets: (B, T) uint8. Returns (logits[B,T,vocab], loss, cache).

    All float64 — see the module docstring for the numeric policy.
    """
    B, T = ids.shape
    d = c.d
    dh = d // c.n_head
    w64 = {k: v.astype(np.float64) for k, v in w.items()}
    wte = w64["wte"].reshape(c.vocab, d)
    wpe = w64["wpe"].reshape(c.ctx, d)

    x = wte[ids] + wpe[np.arange(T)][None, :, :]  # (B, T, d)
    cache: list[dict[str, np.ndarray]] = []
    for l in range(c.n_layer):
        p = f"l{l}."
        x_in = x.copy()
        xn = _ln(x, w64[p + "ln1g"], w64[p + "ln1b"])
        wqkv = w64[p + "wqkv"].reshape(3 * d, d)
        qkv = xn @ wqkv.T + w64[p + "bqkv"]  # (B, T, 3d)

        attn_cat = np.zeros_like(x)
        probs_all = np.zeros((B, c.n_head, T, T))
        for h in range(c.n_head):
            q = qkv[:, :, h * dh : (h + 1) * dh]
            k = qkv[:, :, d + h * dh : d + (h + 1) * dh]
            v = qkv[:, :, 2 * d + h * dh : 2 * d + (h + 1) * dh]
            scores = q @ k.transpose(0, 2, 1) / np.sqrt(dh)  # (B, T, T)
            mask = np.triu(np.ones((T, T), dtype=bool), k=1)
            scores = np.where(mask[None, :, :], -np.inf, scores)
            probs = _softmax_rows(scores)
            probs_all[:, h] = probs
            attn_cat[:, :, h * dh : (h + 1) * dh] = probs @ v

        wo = w64[p + "wo"].reshape(d, d)
        x = x + (attn_cat @ wo.T + w64[p + "bo"])

        x_after_attn = x.copy()
        xn2 = _ln(x, w64[p + "ln2g"], w64[p + "ln2b"])
        w1 = w64[p + "w1"].reshape(4 * d, d)
        w2 = w64[p + "w2"].reshape(d, 4 * d)
        h1pre = xn2 @ w1.T + w64[p + "b1"]
        x = x + (_gelu(h1pre) @ w2.T + w64[p + "b2"])
        cache.append(
            dict(x_in=x_in, qkv=qkv, probs=probs_all, attn_cat=attn_cat,
                 x_after_attn=x_after_attn, h1pre=h1pre)
        )

    x_final = x  # pre final-LN stream (kept for backward)
    xf = _ln(x, w64["lnfg"], w64["lnfb"])
    logits = xf @ wte.T  # tied head — (B, T, vocab)

    loss = None
    if targets is not None:
        probs = _softmax_rows(logits)
        p = np.take_along_axis(probs, targets[:, :, None], axis=2)[:, :, 0]
        loss = float((-np.log(np.maximum(p, 1e-12))).mean())
    return logits, loss, dict(layers=cache, xf=xf, x_final=x_final)


# ---- backward (mirror of lib/llm/backward.ts, float64) ----------------------


def _ln_bwd(dy: np.ndarray, x: np.ndarray, g: np.ndarray):
    """Row-LL over last axis. Returns (dx, dg, db) with dg/db summed over rows."""
    mean = x.mean(axis=-1, keepdims=True)
    var = ((x - mean) ** 2).mean(axis=-1, keepdims=True)
    inv = 1.0 / np.sqrt(var + LN_EPS)
    xhat = (x - mean) * inv
    dg = (dy * xhat).reshape(-1, x.shape[-1]).sum(axis=0)
    db = dy.reshape(-1, x.shape[-1]).sum(axis=0)
    mean_dy = dy.mean(axis=-1, keepdims=True)
    mean_dyx = (dy * xhat).mean(axis=-1, keepdims=True)
    dx = g * inv * (dy - mean_dy - xhat * mean_dyx)
    return dx, dg, db


def backward(w: dict[str, np.ndarray], c: MicroConfig, ids: np.ndarray,
             targets: np.ndarray, cache) -> dict[str, np.ndarray]:
    B, T = ids.shape
    rows = B * T
    d = c.d
    dh = d // c.n_head
    w64 = {k: v.astype(np.float64) for k, v in w.items()}
    grads = {k: np.zeros_like(v, dtype=np.float64) for k, v in w64.items()}

    logits, _, _ = forward(w, c, ids, targets)
    dl = _softmax_rows(logits)
    dl.reshape(rows, c.vocab)[np.arange(rows), targets.reshape(rows)] -= 1.0
    dl /= rows

    wte = w64["wte"].reshape(c.vocab, d)
    dy = (dl.reshape(rows, c.vocab) @ wte).reshape(B, T, d)  # d(final-LN out)
    grads["wte"] += (dl.reshape(rows, c.vocab).T @ cache["xf"].reshape(rows, d)).reshape(-1)
    dx, dg, db = _ln_bwd(dy, cache["x_final"], w64["lnfg"])
    grads["lnfg"] += dg
    grads["lnfb"] += db
    dy = dx

    scale = 1.0 / np.sqrt(dh)
    for l in reversed(range(c.n_layer)):
        p = f"l{l}."
        lc = cache["layers"][l]
        w1 = w64[p + "w1"].reshape(4 * d, d)
        w2 = w64[p + "w2"].reshape(d, 4 * d)
        wo = w64[p + "wo"].reshape(d, d)
        wqkv = w64[p + "wqkv"].reshape(3 * d, d)

        # MLP branch
        gelu_out = _gelu(lc["h1pre"])
        grads[p + "w2"] += (dy.reshape(rows, d).T @ gelu_out.reshape(rows, 4 * d)).reshape(-1)
        grads[p + "b2"] += dy.reshape(rows, d).sum(axis=0)
        dh1post = (dy.reshape(rows, d) @ w2).reshape(B, T, 4 * d)
        u = GELU_C * (lc["h1pre"] + 0.044715 * lc["h1pre"] ** 3)
        th = np.tanh(u)
        du = GELU_C * (1 + 3 * 0.044715 * lc["h1pre"] ** 2)
        dh1pre = dh1post * (0.5 * (1 + th) + 0.5 * lc["h1pre"] * (1 - th**2) * du)
        xn2 = _ln(lc["x_after_attn"], w64[p + "ln2g"], w64[p + "ln2b"])
        grads[p + "w1"] += (dh1pre.reshape(rows, 4 * d).T @ xn2.reshape(rows, d)).reshape(-1)
        grads[p + "b1"] += dh1pre.reshape(rows, 4 * d).sum(axis=0)
        dxn2 = (dh1pre.reshape(rows, 4 * d) @ w1).reshape(B, T, d)
        dx, dg, db = _ln_bwd(dxn2, lc["x_after_attn"], w64[p + "ln2g"])
        grads[p + "ln2g"] += dg
        grads[p + "ln2b"] += db
        dy = dy + dx  # stream grad at post-attn residual

        # attention branch
        grads[p + "wo"] += (dy.reshape(rows, d).T @ lc["attn_cat"].reshape(rows, d)).reshape(-1)
        grads[p + "bo"] += dy.reshape(rows, d).sum(axis=0)
        dattn = (dy.reshape(rows, d) @ wo).reshape(B, T, d)

        dqkv = np.zeros((B, T, 3 * d))
        for h in range(c.n_head):
            dctx = dattn[:, :, h * dh : (h + 1) * dh]
            q = lc["qkv"][:, :, h * dh : (h + 1) * dh]
            k = lc["qkv"][:, :, d + h * dh : d + (h + 1) * dh]
            v = lc["qkv"][:, :, 2 * d + h * dh : 2 * d + (h + 1) * dh]
            probs = lc["probs"][:, h]  # (B, T, T)
            dprobs = dctx @ v.transpose(0, 2, 1)
            dv = probs.transpose(0, 2, 1) @ dctx
            dot = (dprobs * probs).sum(axis=-1, keepdims=True)
            dscores = probs * (dprobs - dot) * scale
            dq = dscores @ k
            dk = dscores.transpose(0, 2, 1) @ q
            dqkv[:, :, h * dh : (h + 1) * dh] = dq
            dqkv[:, :, d + h * dh : d + (h + 1) * dh] = dk
            dqkv[:, :, 2 * d + h * dh : 2 * d + (h + 1) * dh] = dv

        xn1 = _ln(lc["x_in"], w64[p + "ln1g"], w64[p + "ln1b"])
        grads[p + "wqkv"] += (dqkv.reshape(rows, 3 * d).T @ xn1.reshape(rows, d)).reshape(-1)
        grads[p + "bqkv"] += dqkv.reshape(rows, 3 * d).sum(axis=0)
        dxn1 = (dqkv.reshape(rows, 3 * d) @ wqkv).reshape(B, T, d)
        dx, dg, db = _ln_bwd(dxn1, lc["x_in"], w64[p + "ln1g"])
        grads[p + "ln1g"] += dg
        grads[p + "ln1b"] += db
        dy = dy + dx  # stream grad into block input

    # embedding grads (token scatter-add accumulates onto the tied head's)
    demb = dy  # (B, T, d)
    gwte = np.zeros((c.vocab, d))
    gwpe = np.zeros((c.ctx, d))
    for b in range(B):
        for i in range(T):
            gwte[ids[b, i]] += demb[b, i]
            gwpe[i] += demb[b, i]
    grads["wte"] += gwte.reshape(-1)
    grads["wpe"] += gwpe.reshape(-1)
    return grads


# ---- one Adam step at constant peak LR (fixture path, isolates schedule) ----

ADAM = dict(beta1=0.9, beta2=0.99, eps=1e-8)
PEAK_LR = 3e-3
GRAD_CLIP = 1.0


def adam_step(w: dict[str, np.ndarray], grads: dict[str, np.ndarray], lr: float, t: int = 1):
    norm = float(np.sqrt(sum((g**2).sum() for g in grads.values())))
    clip = min(1.0, GRAD_CLIP / norm) if norm > 0 else 1.0
    out: dict[str, np.ndarray] = {}
    bc1 = 1 - ADAM["beta1"] ** t
    bc2 = 1 - ADAM["beta2"] ** t
    for k, wv in w.items():
        g = grads[k] * clip
        m = (ADAM["beta1"] * 0 + (1 - ADAM["beta1"]) * g).astype(np.float32)  # m starts 0
        v = ((1 - ADAM["beta2"]) * g**2).astype(np.float32)
        m_hat = m.astype(np.float64) / bc1
        v_hat = v.astype(np.float64) / bc2
        out[k] = (wv.astype(np.float64) - lr * m_hat / (np.sqrt(v_hat) + ADAM["eps"])).astype(
            np.float32
        )
    return out, norm


# ---- finite-difference gradient check (protects this very file) -------------


def gradcheck(c: MicroConfig, w: dict[str, np.ndarray], ids: np.ndarray,
              targets: np.ndarray, n_checks: int = 64, seed: int = 999
              ) -> tuple[float, float]:
    """Returns (max rel err, max abs err) of backward() vs central finite
    differences on a seeded sample of weight elements.

    Metric note: weights live in float32 storage, so the ±h perturbation is
    rounded into storage — numeric noise scales with ulp(|w|)·slope/h and
    inflates relative error on near-zero gradients. The denominator floor
    of 1e-6 keeps the relative metric honest there; a systematic gradient
    bug would show up at all magnitudes instead."""
    names = [name for name, _ in layout_sizes(c)]
    _, _, cache = forward(w, c, ids, targets)
    analytic = backward(w, c, ids, targets, cache)
    rng = mulberry32(seed)
    keys = [k for k in names if not k.endswith(
        ("ln1g", "ln1b", "ln2g", "ln2b", "bqkv", "bo", "b1", "b2", "lnfg", "lnfb"))]
    max_rel = 0.0
    max_abs = 0.0
    for _ in range(n_checks):
        k = keys[int(rng() * len(keys))]
        flat_w = w[k]
        idx = int(rng() * flat_w.size)
        h = 1e-3 * max(1.0, abs(float(flat_w[idx])))
        orig = float(flat_w[idx])
        flat_w[idx] = orig + h
        _, loss_plus, _ = forward(w, c, ids, targets)
        flat_w[idx] = orig - h
        _, loss_minus, _ = forward(w, c, ids, targets)
        flat_w[idx] = orig
        numeric = (loss_plus - loss_minus) / (2 * h)
        a = float(analytic[k].reshape(-1)[idx])
        max_abs = max(max_abs, abs(a - numeric))
        rel = abs(a - numeric) / max(abs(a), abs(numeric), 1e-6)
        max_rel = max(max_rel, rel)
    return max_rel, max_abs


# ---- JLLM v1 artifact container (mirror of lib/llm/artifact.ts) --------------

MAGIC = b"JLLM"
VERSION = 1
HEADER = "<4sHBBHBBHHIIII"  # 32 bytes
assert struct.calcsize(HEADER) == 32


def write_artifact(weights_flat_f32: np.ndarray, c: MicroConfig, dtype: int) -> bytes:
    """dtype: 0 = fp32, 1 = fp16. numpy's float32→float16 cast is
    round-to-nearest-even like the TS encoder (weights never approach the
    fp16 clamp, so the clamp policy difference is unobservable). The uint16
    view writes little-endian halves on any little-endian host."""
    if dtype == 0:
        payload = weights_flat_f32.astype("<f4").tobytes()
    else:
        payload = weights_flat_f32.astype(np.float16).view(np.uint16).tobytes()
    header = struct.pack(
        HEADER,
        MAGIC,
        VERSION,
        dtype,
        1,  # flags: tied head
        c.d,
        c.n_layer,
        c.n_head,
        c.ctx,
        c.vocab,
        c.params,
        zlib.crc32(payload),
        len(payload),
        0,
    )
    return header + payload


def read_artifact(buf: bytes) -> tuple[np.ndarray, MicroConfig]:
    if len(buf) < 32:
        raise ValueError("file too small to be an LLM Lab model")
    (magic, version, dtype, flags, d, n_layer, n_head, ctx, vocab, params, crc,
     payload_bytes, _reserved) = struct.unpack(HEADER, buf[:32])
    if magic != MAGIC:
        raise ValueError("missing JLLM magic")
    if version != VERSION:
        raise ValueError(f"unsupported version {version}")
    payload = buf[32:]
    if len(payload) != payload_bytes:
        raise ValueError("truncated payload")
    if zlib.crc32(payload) != crc:
        raise ValueError("crc mismatch")
    cfg = MicroConfig(d=d, n_layer=n_layer, n_head=n_head, ctx=ctx, vocab=vocab)
    if params != cfg.params:
        raise ValueError("param count mismatch")
    if dtype == 0:
        w = np.frombuffer(payload, dtype="<f4").astype(np.float32)
    elif dtype == 1:
        w = np.frombuffer(payload, dtype="<u2").view(np.float16).astype(np.float32)
    else:
        raise ValueError("bad dtype")
    return w, cfg
