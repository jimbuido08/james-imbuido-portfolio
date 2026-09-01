/**
 * The TypeScript half of the chess model's encoding contract — the exact
 * mirror of `training/encode.py` (see that file for the contract text and
 * `training/fixtures/golden_positions.json` for cross-language parity
 * fixtures, checked by `npm run verify:chess-model`).
 *
 * Input  — ONNX input name `board`, shape [1, 17, 8, 8], float32, values
 *          exactly 0.0/1.0, built from the 6-field FEN string only.
 * Output — ONNX output name `policy`, shape [1, 4096], float32, flat index
 *          `policyIndex = fromIdx * 64 + toIdx` (model frame),
 *          promotion-blind.
 */

export const PLANES = 17;
export const INPUT_FLOATS = PLANES * 64; // 1088
export const POLICY_LOGITS = 4096;

const PIECE_CHANNELS: Record<string, number> = {
  p: 0,
  n: 1,
  b: 2,
  r: 3,
  q: 4,
  k: 5,
};

/** Own/opp castling plane per FEN castling flag, keyed by side to move. */
const CASTLING_PLANES: Record<"w" | "b", Record<string, number>> = {
  w: { K: 12, Q: 13, k: 14, q: 15 },
  b: { k: 12, q: 13, K: 14, Q: 15 },
};

const EP_PLANE = 16;

export function isBlackToMove(fen: string): boolean {
  const turn = fen.trim().split(" ")[1];
  if (turn !== "w" && turn !== "b") {
    throw new Error(`bad side to move in FEN: ${fen}`);
  }
  return turn === "b";
}

/** Model-frame index of a square. `mirror` is true when Black is to move. */
export function squareIndex(square: string, mirror: boolean): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = mirror ? 8 - rank : rank - 1;
  return row * 8 + file;
}

export function policyIndex(fromIdx: number, toIdx: number): number {
  return fromIdx * 64 + toIdx;
}

/**
 * Encode a 6-field FEN into the flat [1, 17, 8, 8] input tensor
 * (`plane * 64 + squareIndex` layout). Pass `out` to reuse a buffer.
 */
export function encodePosition(fen: string, out?: Float32Array): Float32Array {
  const planes = out ?? new Float32Array(INPUT_FLOATS);
  if (planes.length !== INPUT_FLOATS) {
    throw new Error(
      `encodePosition out buffer must hold ${INPUT_FLOATS} floats`,
    );
  }
  planes.fill(0);

  const fields = fen.trim().split(" ");
  if (fields.length !== 6) {
    throw new Error(
      `expected 6-field FEN, got ${fields.length} fields: ${fen}`,
    );
  }
  const [board, turn, castling, ep] = fields;
  if (turn !== "w" && turn !== "b") {
    throw new Error(`bad side to move: ${turn}`);
  }
  const mirror = turn === "b";

  const ranks = board.split("/");
  if (ranks.length !== 8) {
    throw new Error(`expected 8 ranks in FEN board, got ${ranks.length}`);
  }
  for (let r = 0; r < 8; r++) {
    // ranks[r] is FEN rank 8-r, files a..h (digits skip files)
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      const base = PIECE_CHANNELS[ch.toLowerCase()];
      if (base === undefined) {
        throw new Error(`bad piece char in FEN: ${ch}`);
      }
      const own =
        (ch === ch.toUpperCase() && turn === "w") ||
        (ch === ch.toLowerCase() && turn === "b");
      const channel = own ? base : base + 6;
      const rank = 8 - r;
      const idx = squareIndex(
        `${String.fromCharCode(97 + file)}${rank}`,
        mirror,
      );
      planes[channel * 64 + idx] = 1;
      file += 1;
    }
    if (file !== 8) {
      throw new Error(`rank does not span 8 files: ${ranks[r]}`);
    }
  }

  for (const [flag, channel] of Object.entries(CASTLING_PLANES[turn])) {
    if (castling.includes(flag)) {
      planes.fill(1, channel * 64, (channel + 1) * 64);
    }
  }

  if (ep !== "-") {
    const idx = squareIndex(ep, mirror);
    planes[EP_PLANE * 64 + idx] = 1;
  }

  return planes;
}

/**
 * Pack the 1088 plane bits into 136 bytes, MSB-first, row-major — the byte
 * string the parity fixtures hash (mirrors np.packbits).
 */
export function packPlanes(planes: Float32Array): Uint8Array<ArrayBuffer> {
  if (planes.length !== INPUT_FLOATS) {
    throw new Error(`packPlanes expects ${INPUT_FLOATS} floats`);
  }
  const packed = new Uint8Array(new ArrayBuffer(INPUT_FLOATS / 8));
  for (let i = 0; i < INPUT_FLOATS; i++) {
    if (planes[i] !== 0) {
      packed[i >> 3] |= 0x80 >> (i & 7);
    }
  }
  return packed;
}

/** SHA-256 hex of packPlanes — the `planes_sha256` fixture key. */
export async function planesDigest(planes: Float32Array): Promise<string> {
  const bytes = packPlanes(planes);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
