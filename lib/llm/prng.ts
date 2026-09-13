/**
 * Deterministic randomness for LLM Lab — weight init, batch sampling, and
 * generation sampling all derive from one seeded stream so a (config, corpus,
 * seed) triple always reproduces the same model, and fixture generation is
 * reproducible cross-language.
 *
 * mulberry32 is copied verbatim from lib/voice/modelContract.ts
 * (createSeededRandom) — same stream, deliberately not imported: lib/ features
 * stay self-contained. reference.py mirrors both functions bit-for-bit; the
 * verify gate checks the first values exactly.
 */

/** Seeded uniform PRNG → [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller standard normals from a uniform stream: draws come in pairs
 * (z0 = sqrt(-2 ln u1) cos(2π u2), z1 = · sin(2π u2)), returned in order, so
 * consuming an odd number of draws leaves the spare cached for the next call.
 * u is clamped away from 0 to keep ln finite; the clamp is part of the
 * contract (reference.py must match).
 */
export function normalSampler(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}
