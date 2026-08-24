/**
 * Pure, synchronous chess-claim validation. Strict TS, no `any`; returns a
 * union so callers never throw on bad input (mirrors lib/validation/jtb.ts).
 */
import { MAX_SUBMITTED_MOVES } from "@/lib/chess/constants";
import type {
  ChessClaimRequest,
  PromotionChoice,
  Side,
  SquareName,
  SubmittedMove,
} from "@/types/chess";

export type ChessClaimParseResult =
  { ok: true; claim: ChessClaimRequest } | { ok: false; error: string };

const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTIONS: readonly PromotionChoice[] = ["q", "r", "b", "n"];

function isSquareName(value: unknown): value is SquareName {
  return typeof value === "string" && SQUARE_RE.test(value);
}

export function parseChessClaim(body: unknown): ChessClaimParseResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;

  const playerColor = record.playerColor;
  if (playerColor !== "w" && playerColor !== "b") {
    return { ok: false, error: 'playerColor must be "w" or "b".' };
  }

  const rawMoves = record.moves;
  if (!Array.isArray(rawMoves)) {
    return { ok: false, error: 'An array "moves" field is required.' };
  }
  if (rawMoves.length === 0) {
    return { ok: false, error: "Move history must not be empty." };
  }
  if (rawMoves.length > MAX_SUBMITTED_MOVES) {
    return {
      ok: false,
      error: `Move history must be at most ${MAX_SUBMITTED_MOVES} moves.`,
    };
  }

  const moves: SubmittedMove[] = [];
  for (let i = 0; i < rawMoves.length; i++) {
    const raw = rawMoves[i];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Move ${i + 1} must be an object.` };
    }
    const { from, to, promotion } = raw as Record<string, unknown>;
    if (!isSquareName(from) || !isSquareName(to)) {
      return {
        ok: false,
        error: `Move ${i + 1} needs valid "from"/"to" squares.`,
      };
    }
    if (
      promotion !== undefined &&
      !PROMOTIONS.includes(promotion as PromotionChoice)
    ) {
      return { ok: false, error: `Move ${i + 1} has an invalid promotion.` };
    }
    moves.push({
      from,
      to,
      ...(promotion ? { promotion: promotion as PromotionChoice } : {}),
    });
  }

  return { ok: true, claim: { moves, playerColor: playerColor as Side } };
}
