/**
 * The LLM Lab checkpoint container ("JLLM" v1) — a small self-describing
 * binary format for visitor downloads, visitor uploads, and James's shipped
 * sample under public/models/llm/. Because lib/llm/model.ts lays all weights
 * out in one arena in the fixed buildLayout order, the payload IS the arena.
 *
 * Header (32 bytes, little-endian via DataView):
 *   0   4 B  magic "JLLM"
 *   4   u16  version = 1
 *   6   u8   dtype (0 = fp32, 1 = fp16)
 *   7   u8   flags (bit0: tied head — always 1 in v1)
 *   8   u16  dModel
 *   10  u8   nLayer
 *   11  u8   nHead
 *   12  u16  ctxLen
 *   14  u16  vocabSize
 *   16  u32  paramCount
 *   20  u32  crc32(payload)   (IEEE poly — matches Python zlib.crc32)
 *   24  u32  payloadBytes
 *   28  u32  reserved = 0
 *   32  payload: weights in layout order, LE, fp16 round-to-nearest-even
 *
 * fp16 quantization loses ≤2⁻¹¹ relative — expectation fixtures are recorded
 * from the shipped fp16 file, never the fp32 master (the chess fp16 lesson).
 * All decode failures are human sentences; the UI shows them verbatim.
 *
 * reference.py mirrors this layout byte-for-byte (its reader is used for
 * offline sanity checks on the shipped sample).
 */
import { createModel } from "./model";
import type { Model } from "./model";
import type { ModelConfig } from "./config";
import { assertValidConfig, paramCount } from "./config";

export const ARTIFACT_VERSION = 1;
export const HEADER_BYTES = 32;
const MAGIC = [0x4a, 0x4c, 0x4c, 0x4d]; // "JLLM"

export type ArtifactDtype = 0 | 1; // 0 = fp32, 1 = fp16

// ---- CRC32 (IEEE 802.3, poly 0xEDB88320) — matches Python zlib.crc32 -------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- fp16 <-> fp32 (round-to-nearest-even; no Float16Array dependency) -----

export function f32ToF16Bits(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const abs = Math.abs(value);
  if (abs === 0) return sign;
  if (!Number.isFinite(abs)) return sign | 0x7c00;
  if (abs >= 65504) return sign | 0x7bff; // clamp, don't overflow to Inf
  if (abs < 2 ** -24) return sign; // too small even for a subnormal → ±0

  let bits: number;
  if (abs < 2 ** -14) {
    // subnormal: value = mantissa · 2⁻²⁴. Rounding can carry into 1024, which
    // lands exactly on the smallest normal (0x0400) — keep the carry.
    bits = Math.round(abs / 2 ** -24);
    return sign | bits;
  }
  const exp = Math.floor(Math.log2(abs));
  const mantissa = abs / 2 ** exp - 1; // [0, 1)
  let mantissaBits = Math.round(mantissa * 1024);
  let expBits = exp + 15;
  if (mantissaBits === 1024) {
    // rounding carried into the exponent
    mantissaBits = 0;
    expBits += 1;
    if (expBits >= 31) return sign | 0x7bff; // clamp at max finite
  }
  bits = (expBits << 10) | mantissaBits;
  return sign | bits;
}

export function f16BitsToF32(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exp = (bits >> 10) & 0x1f;
  const frac = bits & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac === 0 ? sign * Infinity : NaN;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

// ---- encode / decode --------------------------------------------------------

export function estimateArtifactBytes(
  config: ModelConfig,
  dtype: ArtifactDtype,
): number {
  return HEADER_BYTES + paramCount(config) * (dtype === 1 ? 2 : 4);
}

/** Serialise a model's weights; payload is the arena in layout order. */
export function encodeArtifact(
  model: Model,
  dtype: ArtifactDtype,
): ArrayBuffer {
  const { config } = model;
  assertValidConfig(config);
  const total = model.layout.total;
  const payloadBytes = total * (dtype === 1 ? 2 : 4);
  const out = new ArrayBuffer(HEADER_BYTES + payloadBytes);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  for (let i = 0; i < 4; i++) bytes[i] = MAGIC[i];
  view.setUint16(4, ARTIFACT_VERSION, true);
  view.setUint8(6, dtype);
  view.setUint8(7, 1); // tied head
  view.setUint16(8, config.dModel, true);
  view.setUint8(10, config.nLayer);
  view.setUint8(11, config.nHead);
  view.setUint16(12, config.ctxLen, true);
  view.setUint16(14, config.vocabSize, true);
  view.setUint32(16, total, true);
  view.setUint32(24, payloadBytes, true);
  view.setUint32(28, 0, true);

  if (dtype === 1) {
    for (let i = 0; i < total; i++)
      view.setUint16(
        HEADER_BYTES + i * 2,
        f32ToF16Bits(model.weights[i]),
        true,
      );
  } else {
    for (let i = 0; i < total; i++)
      view.setFloat32(HEADER_BYTES + i * 4, model.weights[i], true);
  }
  view.setUint32(20, crc32(bytes.subarray(HEADER_BYTES)), true);
  return out;
}

function fail(message: string): never {
  throw new Error(message);
}

/** Parse + validate a container into a fresh Model (weights dequantised to fp32). */
export function decodeArtifact(data: ArrayBuffer | Uint8Array): Model {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < HEADER_BYTES)
    fail("This file is too small to be an LLM Lab model.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 4; i++)
    if (bytes[i] !== MAGIC[i])
      fail("This file isn't an LLM Lab model (missing the JLLM header).");
  const version = view.getUint16(4, true);
  if (version !== ARTIFACT_VERSION)
    fail(`This model file uses an unsupported version (${version}).`);
  const dtype = view.getUint8(6) as ArtifactDtype;
  if (dtype !== 0 && dtype !== 1)
    fail("This model file is corrupted (bad dtype).");
  const flags = view.getUint8(7);
  if ((flags & 1) !== 1)
    fail("This model file is corrupted (untied head in v1).");

  const config: ModelConfig = {
    dModel: view.getUint16(8, true),
    nLayer: view.getUint8(10),
    nHead: view.getUint8(11),
    ctxLen: view.getUint16(12, true),
    vocabSize: view.getUint16(14, true),
  };
  try {
    assertValidConfig(config);
  } catch {
    fail("This model file's shape settings are invalid — it may be corrupted.");
  }
  const total = view.getUint32(16, true);
  if (total !== paramCount(config))
    fail(
      "This model file's size doesn't match its shape — it may be corrupted.",
    );
  const payloadBytes = view.getUint32(24, true);
  if (payloadBytes !== total * (dtype === 1 ? 2 : 4))
    fail("This model file's payload size is wrong — it may be corrupted.");
  if (bytes.length !== HEADER_BYTES + payloadBytes)
    fail("This file is truncated — the model data is incomplete.");

  const payload = bytes.subarray(HEADER_BYTES);
  const crc = view.getUint32(20, true);
  if (crc32(payload) !== crc)
    fail("This model file doesn't match its checksum — it may be corrupted.");

  const model = createModel(config);
  if (dtype === 1) {
    for (let i = 0; i < total; i++)
      model.weights[i] = f16BitsToF32(
        view.getUint16(HEADER_BYTES + i * 2, true),
      );
  } else {
    for (let i = 0; i < total; i++)
      model.weights[i] = view.getFloat32(HEADER_BYTES + i * 4, true);
  }
  return model;
}
