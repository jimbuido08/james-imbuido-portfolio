#!/usr/bin/env python3
"""Generate the LLM Lab golden fixtures (training/llm/fixtures/llm_fixtures.json).

Runs the numpy reference (reference.py) on the fixture micro model and writes
the values the TS verify gate must reproduce: tokenizer cases, PRNG streams,
LR schedule table, micro-model init/forward/loss, and one constant-LR Adam
step (post-step weights + post-step loss). The reference's backward pass is
finite-difference checked here — the fixture generation FAILS if the check
exceeds tolerance, so a bad gradient can never ship as a golden value.

Also records sha256 of the reference-written artifact container — the gate
re-encodes the same weights with lib/llm/artifact.ts and compares hashes,
giving real cross-language container parity.

    python training/llm/make_fixtures.py

Values are rounded to 5 significant digits (voice-fixture precedent); the
gate compares with abs 1e-5 / rel 1e-3.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

import reference as ref

HERE = Path(__file__).resolve().parent
OUT = HERE / "fixtures" / "llm_fixtures.json"

FIXTURE_SEED = 12345          # init + micro model
PRNG_CHECK_SEED = 0xC0FFEE    # stream parity
NORMAL_CHECK_SEED = 42        # Box-Muller parity
FIXTURE_TEXT = "JAMES LAB"    # 9 bytes → 8 inputs + 8 targets at ctx=8
GRADCHECK_TOL = 2e-2
LR_TOTAL_STEPS = 40
PEAK_LR = ref.PEAK_LR
WARMUP_FRAC = 0.05
FINAL_LR_FRAC = 0.1


def rs(x: float) -> float:
    """Round to 5 significant digits (numpy-safe)."""
    return float(f"{float(x):.5g}")


def lr_schedule_table() -> list[float]:
    table = []
    warmup_steps = max(1, int(WARMUP_FRAC * LR_TOTAL_STEPS))
    for step in range(LR_TOTAL_STEPS):
        if step < warmup_steps:
            table.append(PEAK_LR * (step + 1) / warmup_steps)
        else:
            span = max(1, LR_TOTAL_STEPS - warmup_steps)
            progress = min(1.0, (step - warmup_steps) / span)
            floor = FINAL_LR_FRAC * PEAK_LR
            table.append(floor + 0.5 * (1 + np.cos(np.pi * progress)) * (PEAK_LR - floor))
    return [rs(v) for v in table]


def main() -> int:
    c = ref.MICRO
    assert c.params == 10816, f"micro config drifted: {c.params} != 10816"

    # tokenizer cases — exact byte ids, incl. multibyte (mirrors tokenizer.ts).
    texts = ["", "Hello, JTB!", "héllo", "🙂🚀", "语言模型", "line\nbreak"]
    tokenizer_cases = [
        {"text": t, "ids": list(t.encode("utf-8"))} for t in texts
    ]

    rng = ref.mulberry32(PRNG_CHECK_SEED)
    prng_first32 = [rng() for _ in range(32)]  # exact values (no rounding)
    normals = ref.normal_sampler(ref.mulberry32(NORMAL_CHECK_SEED))
    normals_first8 = [normals() for _ in range(8)]

    # micro model: init → forward → backward (gradchecked) → one Adam step.
    flat = ref.init_flat(c, FIXTURE_SEED)
    w = ref.split_weights(flat.copy(), c)
    ids_bytes = list(FIXTURE_TEXT.encode("utf-8"))
    ids = np.array([ids_bytes[: c.ctx]], dtype=np.uint8)  # (1, 8)
    targets = np.array([ids_bytes[1 : c.ctx + 1]], dtype=np.uint8)

    logits, loss, cache = ref.forward(w, c, ids, targets)
    probs = ref._softmax_rows(logits)  # what the TS workspace exposes post-forward
    assert loss is not None
    grads = ref.backward(w, c, ids, targets, cache)
    max_rel, max_abs = ref.gradcheck(c, w, ids, targets)
    print(f"gradcheck max rel err: {max_rel:.3e} (tolerance {GRADCHECK_TOL}), max abs err {max_abs:.3e}")
    if max_rel > GRADCHECK_TOL:
        raise SystemExit("GRADCHECK FAILED — fix reference.py before shipping fixtures")

    # grad norm for the record; then one step at constant peak LR, t=1.
    post_w, grad_norm = ref.adam_step(w, grads, PEAK_LR, t=1)
    _, loss_after, _ = ref.forward(post_w, c, ids, targets)
    post_flat = np.concatenate([np.asarray(post_w[name], dtype=np.float32)
                                for name, _ in ref.layout_sizes(c)])

    init_art = ref.write_artifact(flat, c, dtype=0)
    init_art16 = ref.write_artifact(flat, c, dtype=1)

    fixture = {
        "version": 1,
        "note": "Regenerate with training/llm/make_fixtures.py — never hand-edit.",
        "tokenizer_cases": tokenizer_cases,
        "prng": {
            "seed": PRNG_CHECK_SEED,
            "first32": prng_first32,
            "normals_seed": NORMAL_CHECK_SEED,
            "normals_first8": [rs(v) for v in normals_first8],
        },
        "lr_schedule": {
            "totalSteps": LR_TOTAL_STEPS,
            "peakLr": PEAK_LR,
            "warmupFrac": WARMUP_FRAC,
            "finalLrFrac": FINAL_LR_FRAC,
            "lr": lr_schedule_table(),
        },
        "micro": {
            "config": {
                "dModel": c.d, "nLayer": c.n_layer, "nHead": c.n_head,
                "ctxLen": c.ctx, "vocabSize": c.vocab,
            },
            "paramCount": c.params,
            "seed": FIXTURE_SEED,
            "batch": 1,
            "seq": c.ctx,
            "text": FIXTURE_TEXT,
            "input_ids": ids_bytes[: c.ctx],
            "targets": ids_bytes[1 : c.ctx + 1],
            "init_weights": [rs(v) for v in flat.tolist()],
            "probs": [rs(v) for v in probs.reshape(-1).tolist()],
            "loss": rs(loss),
            "grad_norm_pre_clip": rs(grad_norm),
            "post_step": {
                "lr": PEAK_LR,
                "beta1": ref.ADAM["beta1"],
                "beta2": ref.ADAM["beta2"],
                "eps": ref.ADAM["eps"],
                "t": 1,
                "weights": [rs(v) for v in post_flat.tolist()],
                "loss_after": rs(loss_after),
            },
            "gradcheck_max_rel_err": rs(max_rel),
            "gradcheck_max_abs_err": rs(max_abs),
            "artifact_fp32_sha256": hashlib.sha256(init_art).hexdigest(),
            "artifact_fp16_sha256": hashlib.sha256(init_art16).hexdigest(),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixture), encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name} ({size_kb:.0f} KB) - loss {loss:.4f} -> {loss_after:.4f} after 1 step")
    fp32_sha = fixture["micro"]["artifact_fp32_sha256"]
    fp16_sha = fixture["micro"]["artifact_fp16_sha256"]
    print(f"artifact sha fp32 {fp32_sha[:16]} / fp16 {fp16_sha[:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
