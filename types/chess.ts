/** Shared chess vocabulary. UI, engine wrapper, and Phase 7 server replay all use these. */
export type Side = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionChoice = Extract<PieceType, "q" | "r" | "b" | "n">;

type File = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
type Rank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type SquareName = `${File}${Rank}`;

/** A verbose, engine-agnostic move record. */
export interface MoveSnapshot {
  from: SquareName;
  to: SquareName;
  san: string;
  color: Side;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
}

export type DrawReason =
  "stalemate" | "threefold" | "insufficient" | "fifty-move";

/** Engine-known status. Resignation is a UI concern and never appears here. */
export type EngineStatus =
  | { kind: "playing"; check: boolean }
  | { kind: "over"; winner: Side | null; reason: "checkmate" | DrawReason };

/** UI-level result: anything the engine knows, plus resignation. */
export interface GameResult {
  winner: Side | null;
  reason: "checkmate" | DrawReason | "resignation";
}

export type Difficulty = "easy" | "medium" | "hard";

/** One board square: name plus occupant (or null). */
export interface SquareState {
  square: SquareName;
  piece: { type: PieceType; color: Side } | null;
}

/** Wire format for one submitted move — from/to/promotion is all replay needs. */
export interface SubmittedMove {
  from: SquareName;
  to: SquareName;
  promotion?: PromotionChoice;
}

/** POST /api/chess request body: moves + caller's color, nothing else (§3.7). */
export interface ChessClaimRequest {
  moves: SubmittedMove[];
  playerColor: Side;
}

export type ChessClaimErrorCode =
  | "unauthenticated"
  | "invalid"
  | "illegal_game"
  | "not_a_win"
  | "already_claimed"
  | "rate_limited"
  | "internal";

export interface ChessClaimError {
  error: {
    code: ChessClaimErrorCode;
    message: string;
  };
  creditsRemaining?: number;
}

export interface ChessClaimSuccess {
  ok: true;
  creditsAwarded: number;
  creditsRemaining: number;
}

/** Shape of the claim_chess_reward RPC's jsonb return. rateLimited (with
 *  claimed=false) is the RPC's authoritative rate gate refusing the caller
 *  — the once-per-user gate is claimed=false without it. */
export interface ClaimChessRewardResult {
  claimed: boolean;
  creditsRemaining: number | null;
  rateLimited?: boolean;
}
