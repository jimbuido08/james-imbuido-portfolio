/**
 * Decode-only reader for the "STOR" v1 container — the storyteller model's
 * on-disk/on-wire format (see training/storyteller/export.py for the writer).
 *
 * 32-byte little-endian header: magic "STOR", u16 version, u8 dtype (1=fp16),
 * u8 flags (bit0 tied head, bit1 interleaved RoPE), u16 nEmbd, u8 nLayer,
 * u8 nHead, u16 ctxLen, u16 vocabSize, u32 paramCount, u32 crc32(payload),
 * u32 payloadBytes, u32 reserved. Payload: fp16 weights in the fixed layout
 * order below. The fp16/CRC32 codecs are imported from lib/llm/artifact.ts —
 * one codec, two containers.
 */

import { crc32, f16BitsToF32 } from "../llm/artifact";
import {
  StorytellerConfig,
  assertValidStorytellerConfig,
  hiddenOf,
  storytellerParamCount,
} from "./config";

export const STOR_MAGIC = 0x524f_5453; // "STOR" little-endian u32
export const STOR_VERSION = 1;
export const STOR_HEADER_BYTES = 32;

export interface StorytellerLayerWeights {
  ln1: Float32Array; // [d]
  qkv: Float32Array; // [3d, d] row-major
  proj: Float32Array; // [d, d]
  ln2: Float32Array; // [d]
  w1: Float32Array; // [hidden, d]
  w3: Float32Array; // [hidden, d]
  w2: Float32Array; // [d, hidden]
}

export interface StorytellerWeights {
  wte: Float32Array; // [vocab, d] row-major — the tied lm_head
  layers: StorytellerLayerWeights[];
  normF: Float32Array; // [d]
}

export interface DecodedStoryteller {
  config: StorytellerConfig;
  weights: StorytellerWeights;
  /** The raw paramCount from the header (== storytellerParamCount(config)). */
  paramCount: number;
}

/** The payload order — the single layout contract (mirrors export.py PAYLOAD_ORDER). */
export function decodeStoryteller(bytes: Uint8Array): DecodedStoryteller {
  if (bytes.length < STOR_HEADER_BYTES) {
    throw new Error("This file is too small to be a storyteller model.");
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== STOR_MAGIC) {
    throw new Error("This file isn't a storyteller model (bad magic).");
  }
  const version = dv.getUint16(4, true);
  if (version !== STOR_VERSION) {
    throw new Error(
      `This storyteller model is version ${version}; this site supports version ${STOR_VERSION}.`,
    );
  }
  const dtype = dv.getUint8(6);
  if (dtype !== 1) {
    throw new Error(
      "This storyteller model isn't fp16-encoded; it can't be loaded.",
    );
  }
  const flags = dv.getUint8(7);
  if ((flags & 0b01) === 0) {
    throw new Error(
      "This storyteller model has an untied head; v1 containers are always tied.",
    );
  }

  const config: StorytellerConfig = {
    nEmbd: dv.getUint16(8, true),
    nLayer: dv.getUint8(10),
    nHead: dv.getUint8(11),
    ctxLen: dv.getUint16(12, true),
    vocabSize: dv.getUint16(14, true),
  };
  assertValidStorytellerConfig(config);

  const paramCount = dv.getUint32(16, true);
  if (paramCount !== storytellerParamCount(config)) {
    throw new Error(
      "This storyteller model's parameter count doesn't match its shape.",
    );
  }
  const crc = dv.getUint32(20, true);
  const payloadBytes = dv.getUint32(24, true);
  if (payloadBytes !== paramCount * 2) {
    throw new Error(
      "This storyteller model's payload size doesn't match its parameter count.",
    );
  }
  if (bytes.length !== STOR_HEADER_BYTES + payloadBytes) {
    throw new Error(
      "This storyteller model file is truncated — the payload doesn't match the header.",
    );
  }
  const payload = bytes.subarray(STOR_HEADER_BYTES);
  if (crc32(payload) !== crc) {
    throw new Error(
      "This storyteller model file is corrupted (checksum mismatch).",
    );
  }

  // Dequantize fp16 → f32 into one flat arena, then carve named views in order.
  const arena = new Float32Array(paramCount);
  for (let i = 0; i < paramCount; i++) {
    arena[i] = f16BitsToF32(dv.getUint16(STOR_HEADER_BYTES + i * 2, true));
  }

  const { nEmbd: d, vocabSize, nLayer } = config;
  const hidden = hiddenOf(d);
  let pos = 0;
  const take = (n: number): Float32Array => {
    const view = arena.subarray(pos, pos + n);
    pos += n;
    return view;
  };

  const wte = take(vocabSize * d);
  const layers: StorytellerLayerWeights[] = [];
  for (let i = 0; i < nLayer; i++) {
    layers.push({
      ln1: take(d),
      qkv: take(3 * d * d),
      proj: take(d * d),
      ln2: take(d),
      w1: take(hidden * d),
      w3: take(hidden * d),
      w2: take(d * hidden),
    });
  }
  const normF = take(d);
  if (pos !== paramCount) {
    throw new Error(
      "This storyteller model's weights didn't lay out correctly.",
    );
  }

  return { config, weights: { wte, layers, normF }, paramCount };
}
