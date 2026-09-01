# PHASE 4 — CHESS: Implementation Plan

> Executor: you are implementing **Phase 4 (Chess)** of a Next.js portfolio, in **two milestones (A then B), each ending in one conventional commit**. Follow this document exactly. Do not invent features, routes, or dependencies. Do not touch 3D files (`components/universe/`, `lib/universe/`), `app/page.tsx`, `app/design/page.tsx`, `components/navigation/*`, Supabase files, JTB files, or the contact/about/experience/project pages built in Phase 3 — all out of scope. If you run low on budget, complete and commit Milestone A and stop; A is self-standing.

## 1. Context

Phases 1–3 built the design system, the 3D Data Universe homepage, and the conventional portfolio (About / Experience / Contact / project systems). `/chess` is still the Phase-2 placeholder. Phase 4 per master plan §28 builds: chess board, legal-move validation, game state, client-side opponent, AI moves, game termination, difficulty settings, loading/error states, responsive UI. Authoritative spec sections: §3.6 (game requirements), §14.2 (stack: chess.js + custom client-side model), §17 (lazy-load chess deps; homepage must not download them), §18 (accessibility), §27 (mobile), §32 (definition of done). §3.7 (chess reward) is **Phase 7** and is explicitly NOT built here — but the engine is designed so Phase 7's server replay can reuse it unchanged.

**The one thing you must understand before writing a line:** James's trained chess model does not exist as an exportable artifact yet (`public/models/` contains only `.gitkeep`). §34 splits "8. Chess UI" from "9. Client-side chess model" for exactly this reason. So this phase ships the complete, fully playable game — real rules, real game flow, real difficulty levels — with an **honest heuristic stand-in opponent** behind the exact interface the trained model will later implement. The UI copy must never claim the opponent is James's trained model. This is the same honesty principle as Phase 3's `[TODO: James — …]` markers, applied to a feature instead of copy.

### Hard rules (violating any of these = failed milestone)

1. **Exactly one new dependency in the whole phase: `chess.js` (v1, Milestone A).** Do NOT install `react-chessboard`, any chessboard UI kit, `onnxruntime-web`, `@tensorflow/*`, `stockfish` packages, icon libraries, or anything else. The board is hand-built from design tokens — the repo builds its own UI (§12, §33); a board library would fight the token palette and its accessibility would be out of our control.
2. **Design tokens only.** No hex codes, no `zinc-*`/`gray-*`/`slate-*` utilities, no gradients/glow/glassmorphism. Allowed utilities come from `app/globals.css` `@theme`: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong` (incl. **`bg-border` / `bg-border-strong`** — these exist and are the locked board-square colors), `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-accent-{ai,data,jtb,chess,about,exp,neut}` incl. `/NN` opacity variants, `text-focus`, `font-sans`, `font-mono`.
3. **Strict TypeScript, no `any`.** `npm run build` must type-check clean. Do NOT annotate components with `JSX.Element` — React 19 removed the global `JSX` namespace; let return types be inferred.
4. **Next 16.3.2 notes (older Next knowledge will betray you):** static page this phase — no `params` involved. Client components are SSR'd for initial HTML by App Router; initial state must therefore be deterministic — **no `Math.random()` during render or in useState/useReducer initializers**; randomness lives only in event handlers and effects.
5. **Keep every existing `.gitkeep`** even after adding real files to those directories — including `public/models/.gitkeep` (no model artifact this phase).
6. **Honesty rule:** user-visible copy must say the opponent is a heuristic stand-in, that the trained model lands later, and that the +5 JTB reward arrives with later phases. Never present the stand-in as the trained model.
7. **Rules/model separation (§3.6, CLAUDE.md):** the rules engine alone determines legality; the opponent only ever *picks among* verbose legal moves provided to it. The UI never applies an opponent move without passing it back through the engine's validator.
8. **`lib/chess/` is isomorphic.** No React, DOM, `window`, or browser-only imports anywhere under `lib/chess/` — Phase 7's server route will `import` these exact modules to replay games. A header comment in each file states this.

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TS strict, Tailwind v4 CSS-first (all config in `app/globals.css`; no `tailwind.config.*`). `@/*` → repo root. npm only. No test framework by design. Prettier ignores `*.md` so this document is never format-checked.
- `app/chess/page.tsx` is the placeholder (Tag `domain="chess"`, "The chess experience lands in Phase 4…", `TODO(PHASE-4)` comment). You will rewrite its body, keeping the existing `metadata` object (title `"Chess AI — James Imbuido"`, description `"Play against a chess model that runs entirely in your browser."` — still accurate).
- Tokens relevant here (from `app/globals.css`): `--color-border: #26262c`, `--color-border-strong: #3a3a42` (board squares), `--color-accent-chess: #4da37e` (selection/legal-move accent), `--color-accent-exp: #d98c96` (muted rose — the locked in-check indicator), `--color-accent-neut: #9ca3af`. Global `:focus-visible` outline and a global `prefers-reduced-motion` rule already exist in the base layer — do not re-add.
- Primitives (`@/components/ui/<Name>`): `Container`, `SectionHeading({kicker?, title, description?, as?, className?})`, `Tag({domain})`, `Card/CardHeader/CardTitle/CardDescription/CardFooter`, `Button({variant?: "primary"|"secondary"|"ghost", size?: "sm"|"md"|"lg", href?, ...buttonProps})` — **CRITICAL: with `href` set it renders a Link and buttonProps are dropped; use the no-`href` `<button>` path for `onClick`/`aria-pressed`/`disabled`.** `cx(...)` from `@/lib/utils`.
- Empty dirs with `.gitkeep` awaiting you: `lib/chess/`, `components/chess/`. `types/` contains only `project.ts` (do not touch it). `public/models/` has `.gitkeep` only.
- `chess.js` is NOT installed. No other chess/model dep exists.
- Scripts: `npm run build | dev | lint | format | format:check`. "Done" = §8 verification.

## 3. Locked decisions (do not redesign)

1. **Rules engine: `chess.js@^1`** (TS-native, isomorphic — also the Phase-7 server replay implementation, §14.2). v1 changed `.move()` error semantics vs pre-1.0 (throw vs `null`); the wrapper handles BOTH: `try { mv = g.move(o) } catch { return { ok: false } }` then `if (!mv) return { ok: false }`. After install, skim `node_modules/chess.js/README.md` once to confirm field names (`from`, `to`, `san`, `piece`, `color`, `captured?`, `promotion?`).
2. **No board library.** Hand-built 8×8 token board. Pieces are **unicode chess glyphs rendered as text**: white pieces = filled glyphs `♚♛♜♝♞♟`, black pieces = outline glyphs `♔♕♖♗♘♙`, both `text-fg` (this filled/outline split is the side distinction — pure glyph, fully themeable, zero color-contrast failure modes, and the glyph span is `aria-hidden` because the square button carries the accessible name).
3. **Square colors:** light squares `bg-border-strong` (#3a3a42), dark squares `bg-border` (#26262c). Highlights: last-move squares `bg-accent-neut/20`; selected square `bg-accent-chess/30`; legal empty targets get a centered dot (`after:`-pseudo utility classes, `bg-accent-chess`); legal capture targets `ring-2 ring-inset ring-accent-chess`; king-in-check square `bg-accent-exp/50`. No other board colors exist.
4. **Opponent = interface + three honest stand-ins** (`lib/chess/opponents.ts`): `easy` = uniform random legal move; `medium` = 1-ply greedy (capture value − small hanging-risk penalty + check bonus); `hard` = negamax with alpha-beta, depth 2, material + tiny centrality term, using `chess.js` clones internally. All three take `{ fen, legal }` and MUST return an element of `legal` — legal by construction. A short fixed thinking delay (~250 ms) is applied for UX. A `// TODO(MODEL):` comment marks where `OnnxOpponent` (lazy `import("onnxruntime-web")` + fetch from `/models/`) will slot in when James exports the trained model — that is the §34 step-9 follow-up, gated on a real artifact.
5. **Interaction** — three equivalent paths, all honoring one `attemptMove(from, to)` gate:
   - **Tap-tap (primary):** click/Enter selects an own piece (shows legal targets), click/Enter a target to move; click the selected square or press Escape to deselect; click another own piece to switch selection.
   - **Drag (required by §3.6):** Pointer Events. pointerdown on an own-piece square arms a drag; a `position:fixed pointer-events-none` glyph follows the pointer once movement exceeds ~6 px (below that it's a tap — guard so the click handler doesn't double-fire); pointerup resolves the drop square from `document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-square]")`; drop outside the board or on the origin just cancels. Squares carry `data-square="e4"` attributes. Default `touch-action: manipulation` on squares (page scroll must keep working); switch to `touch-action: none` only while a drag is active.
   - **Keyboard:** the 64 square buttons use **roving tabindex** (exactly one square is `tabIndex={0}`, the rest `-1` — NOT 64 tab stops). Arrow keys move focus (orientation-aware: ArrowUp increases rank when White is at the bottom); Enter/Space selects or moves; Escape cancels selection. Initial focus square: e1. After a completed move, focus the destination square. **ARIA shape:** every square stays a real `<button>` with a rich `aria-label` (rule: never put `role="gridcell"` on a `<button>` — it strips button semantics); the board container is `<div role="group" aria-label="Chess board">`, NOT `role="grid"` (APG grid roles require non-interactive cells wrapped in rows — wrong fit here since every cell is itself the widget).
6. **Input gate:** board input is accepted only when the game is playing AND it is the player's turn AND no promotion is pending AND no result exists. AI-turn clicks are silently ignored (the status line says why). Never use `disabled` on square buttons — it kills focus and keyboard nav.
7. **Promotion:** never auto-queen. When the selected target square has promotion moves among the legal targets, open an in-board centered overlay dialog (`role="dialog" aria-modal="true" aria-label="Choose promotion piece"`) with four large glyph buttons Q R N B (`aria-label="Promote to queen"` etc.). Focus moves into the dialog on open; Escape cancels and returns focus to the origin square. The AI always promotes to queen (locked).
8. **No motion at all in the chess UI.** Pieces appear/disappear instantly; the floating drag glyph is the only moving element and is a direct pointer projection, not an animation. This is the restraint-first reading of §12/§18 and makes `prefers-reduced-motion` a no-op by construction. `transition-colors` on interactive chrome (squares/buttons) is fine — the global reduced-motion rule already nulls it.
9. **One `"use client"` file:** `components/chess/ChessGame.tsx` (mirrors Phase 3's single-client-component pattern). All other chess components are plain function components imported by it — no directives, nothing crosses the RSC boundary except the page importing `<ChessGame />` (zero props). **No API routes this phase.** `app/chess/page.tsx` stays a server component with static metadata.
10. **Bundle:** `chess.js` is statically imported by the client chunk of `/chess` only — route code-splitting keeps it off the homepage and every other route (§17 satisfied). The future trained model will lazy-load via dynamic import + `fetch("/models/…")` — that seam is the `ChessOpponent` interface, and this phase builds only the interface side.
11. **Difficulty applies live; color applies on next new game.** Two chip groups (same pattern as Phase-3 filter chips: `Button size="sm"`, `secondary` when active / `ghost` otherwise, `aria-pressed`): **Difficulty** (EASY/MEDIUM/HARD — takes effect on the next AI move, does not restart the game) and **Play as** (WHITE/BLACK — a pending preference consumed by the **New game** primary button). Plus a ghost **Resign** with two-step inline confirm (first click → text becomes "Confirm resignation" for ≤5 s, `aria-live`; second click ends the game as a loss by resignation; revert the label on timeout). Resign renders only while the game is playing.
12. **Board orientation:** default White at bottom; playing Black flips both rank and file order and the in-square coordinates. Empty state of the move list: the literal text "No moves yet." Latest move row `text-fg`, earlier rows `text-fg-muted`; auto-scroll to the latest row on update with `scrollIntoView({ block: "nearest" })` (no `behavior: "smooth"`).
13. **Status strings (locked verbatim):** `Your move` / `Opponent is thinking…` / `Check — your move` / terminal: `Checkmate — you win`, `Checkmate — the AI wins`, `Stalemate — draw`, `Draw — threefold repetition`, `Draw — insufficient material`, `Draw — fifty-move rule`, `You resigned — the AI wins`. The status line wrapper has `aria-live="polite"` and the kicker classes `font-mono text-xs uppercase tracking-widest text-fg-subtle`. Note: the `…` characters above are the literal ellipsis glyph, matching the codebase style.
14. **Game-over panel** (inside `GameStatus`, only when a result exists): a `border-border bg-surface` rounded panel under the board with the terminal sentence, this exact honest note — `Verified rewards land with accounts in a later phase: beating the chess AI will grant +5 JTB interactions.` — and a `New game` (primary, sm) button. No reward claim UI, no PGN export (Phase 7+).

## 4. Milestone A — isomorphic engine + opponent interface

### 4.1 Dependency

```bash
npm install chess.js@^1        # the ONLY new dependency of the entire phase
```

### 4.2 CREATE `types/chess.ts` (verbatim — this is the locked data contract)

```ts
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

export type DrawReason = "stalemate" | "threefold" | "insufficient" | "fifty-move";

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
```

### 4.3 CREATE `lib/chess/engine.ts`

Header comment, line 1: `/** Isomorphic chess rules wrapper (no React/DOM imports) — Phase 7 reuses this server-side to replay submitted games. */`

Exported contract (implement exactly; import the used types from `@/types/chess` — never import unused names):

```ts
export interface ChessGameEngine {
  /** Current position as FEN. */
  fen(): string;
  /** Side to move. */
  turn(): Side;
  /** All 64 squares in chess.js board order (rank 8 first, files a→h). */
  squares(): SquareState[];
  /** Verbose legal moves, optionally restricted to an origin square. */
  legalMoves(square?: SquareName): MoveSnapshot[];
  /**
   * Validate and apply a move. Never throws on illegality:
   * returns { ok: false } instead. Resolves promotion from `promotion` (default "q"
   * is NOT allowed here — the caller must pass it for promotion moves).
   */
  tryMove(
    from: SquareName,
    to: SquareName,
    promotion?: PromotionChoice,
  ): { ok: true; move: MoveSnapshot } | { ok: false };
  /** Engine status of the current position (playing+check, or terminal). */
  status(): EngineStatus;
  /** Verbose move history since the last reset/load. */
  history(): MoveSnapshot[];
  /** Reset to the standard initial position. */
  reset(): void;
}

export function createEngine(fen?: string): ChessGameEngine;

/**
 * Phase 7 seam (build it now — it is ~10 lines): re-apply a submitted move list
 * from the initial position (or `fen`) and report whether every move was legal.
 */
export function replayMoves(
  moves: ReadonlyArray<{ from: SquareName; to: SquareName; promotion?: PromotionChoice }>,
  fen?: string,
): { ok: true; engine: ChessGameEngine } | { ok: false; atIndex: number };
```

Implementation notes: wrap one `Chess` instance in a closure (no class needed — §33); map verbose `Move` objects to `MoveSnapshot` field-by-field (do not spread library objects into our types — map explicitly, and coerce absent `captured`/`promotion` to `undefined`); `status()` checks `isCheckmate()` → `isStalemate()` → `isThreefoldRepetition()` → `isInsufficientMaterial()` → `isDrawByFiftyMoves()` (confirm exact method name in the installed README; older versions expose a combined `isDraw()` — then map via the individual reasons available) → else `{ kind: "playing", check: isCheck() }`.

### 4.4 CREATE `lib/chess/opponents.ts`

Header comment, line 1: `/** Isomorphic opponent module (no React/DOM imports). Honest stand-ins until the trained model ships — see TODO(MODEL) below. */`

Exported contract:

```ts
export interface OpponentInput {
  fen: string;
  /** Verbose legal moves in the position — the only moves an opponent may return. */
  legal: MoveSnapshot[];
}

/** A chess opponent that picks among legal moves it is given (§3.6 separation). */
export interface ChessOpponent {
  readonly difficulty: Difficulty;
  selectMove(input: OpponentInput): Promise<MoveSnapshot>;
}

export function createOpponent(difficulty: Difficulty): ChessOpponent;
```

Implementations (private): `easyOpponent` — `legal[Math.floor(Math.random() * legal.length)]`. `mediumOpponent` — for each move, construct a fresh `Chess(input.fen)`, apply, score `capturedValue * 10 - movedPieceValue * 0.25 + (givesCheck ? 1.5 : 0)` with values p=1,n=3,b=3,r=5,q=9 (king 0 — king never captures into check, the clone rejects it); pick max, tie-break randomly. `hardOpponent` — negamax, depth 2, alpha-beta, eval = material (same values) + 0.05 per pawn/knight occupying e4/d4/e5/d5; uses `Chess` clones, respects turn. Every implementation ends with `await think()` (~250 ms fixed; the only place timers appear in the module) then returns its pick. `// TODO(MODEL): implement OnnxOpponent against this interface once public/models/ holds real weights.` Guards: if `legal.length === 0`, throw `Error("selectMove called with no legal moves")` — the UI must never let that happen; the throw is the tripwire.

### 4.5 Milestone A verification (run every command)

```bash
npm ls chess.js                                                          # chess.js@1.x
npm ls react-chessboard onnxruntime-web @tensorflow/tfjs stockfish 2>&1  # "(empty)" for each
npm run build 2>&1 | grep -E "Compiled successfully|error"               # compiled, no errors
npm run lint && npm run format:check                                     # both exit 0
node --input-type=module -e "import {Chess} from 'chess.js'; const c = new Chess(); console.log('start legal:', c.moves().length)"
# expect: start legal: 20   (run from repo root; if bare-specifier eval fails on your Node,
# fallback: write the same statement to a scratch .mjs in the repo root, run it, delete it)
node --input-type=module -e "import {Chess} from 'chess.js'; const c = new Chess(); for (const m of ['f3','e5','g4']) c.move(m); c.move('Qh4#'); console.log('mate:', c.isCheckmate(), c.isGameOver())"
# expect: mate: true true   (fool's mate — legality + mate detection both work)
grep -rE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' lib/chess types/chess.ts   # expect NO output
grep -rn 'window\|document\|react' lib/chess/ --include='*.ts'            # expect NO output (isomorphy guard)
ls lib/chess/.gitkeep components/chess/.gitkeep public/models/.gitkeep    # all still present
```

Commit (single, conventional):

```
feat(chess): add isomorphic rules engine and client opponent interface

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 5. Milestone B — playable UI

### 5.1 State shape (in `ChessGame.tsx`, `useReducer` — locked)

```ts
interface GameUiState {
  engine: ChessGameEngine;      // created via createEngine(), held by reference
  version: number;              // bump on every applied move / reset to re-render
  playerColor: Side;
  nextPlayerColor: Side;        // pending "Play as" preference for New game
  difficulty: Difficulty;       // live
  selected: SquareName | null;  // selected origin square
  focusSquare: SquareName;      // roving tabindex owner ("e1" initially)
  pendingPromotion: { from: SquareName; to: SquareName } | null;
  lastMove: { from: SquareName; to: SquareName } | null;
  history: MoveSnapshot[];      // mirrors engine.history()
  thinking: boolean;            // AI turn in flight
  resignArmed: boolean;         // two-step resign
  result: GameResult | null;
}
```

Reducer actions: `selectSquare`, `clearSelection`, `moveFocus`, `applyMove(move)`, `armResign`/`disarmResign`, `resign`, `setDifficulty`, `setNextPlayerColor`, `newGame`, `setThinking`. Engine mutation happens inside helpers immediately before dispatch (engine instance is an implementation detail; `version` is the render signal). Derive per render: `legalTargets = selected ? engine.legalMoves(selected) : []`, `status = engine.status()`, `checkSquare = status.check ? squares().find(king of side-to-move) : null`.

**AI trigger effect (StrictMode-safe — Next dev double-invokes effects):** `useEffect` on `[version, playerColor, difficulty, result]`: if `result` or engine.turn() === playerColor or game over → return. Else set thinking, capture a local token (`const run = ++aiRunRef.current`), `createOpponent(difficulty).selectMove({ fen, legal })` then in `.then`: if `run !== aiRunRef.current` OR a per-effect `cancelled` flag (set by cleanup) → drop the result; else `engine.tryMove(move.from, move.to, move.promotion)` → dispatch `applyMove`. On the (impossible-by-construction) `{ok:false}` path, fall back to a random legal move — log to console, do not crash. Cleanup function sets `cancelled = true`.

### 5.2 CREATE `components/chess/ChessGame.tsx`

`"use client"` on line 1. `useReducer` per §5.1; owns everything; renders (exact order):

```tsx
<div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,36rem)_18rem]">
  <div>{/* board column: GameStatus line, ChessBoard wrapper (relative), GameControls */}</div>
  <MoveList history={history} />
</div>
```

Board wrapper: `relative w-full max-w-[36rem]`. PromotionDialog is rendered as an absolutely-positioned child of that wrapper when `pendingPromotion` is set. `attemptMove(from, to)`: if promotion options exist among `legalTargets` for `(from,to)` → set `pendingPromotion`, don't move; else `tryMove` → on ok dispatch `applyMove` + focus destination.

### 5.3 CREATE `components/chess/ChessBoard.tsx` (no directive — imported only by ChessGame)

Props: `squares: SquareState[]; orientation: Side; selected; legalTargets: MoveSnapshot[]; lastMove; checkSquare: SquareName | null; focusSquare; interactive: boolean; dragging glyph state; onSquarePointerDown / onSquareClick / onSquareKeyDown` (handler props are fine — parent is a client component, no RSC boundary). Render order helper `orderedSquares(squares, orientation)`: `squares` arrives rank-8-first files a→h; for `orientation === "b"` reverse ranks AND files. Grid: container `div role="group" aria-label="Chess board"` (per locked decision 5), `grid grid-cols-8 overflow-hidden rounded-lg border border-border`. Each square: `<button type="button" aria-label={label} data-square={name} tabIndex={name===focusSquare?0:-1} className={cx("relative flex aspect-square touch-manipulation items-center justify-center", light? "bg-border-strong":"bg-border", highlightClasses)}>`. `aria-label` grammar (locked): `"e2, white pawn"` | `"e5, empty"` plus suffixes `", selected"` when selected, `", legal move"` when an empty target, `", legal capture"` when a capture target. Piece glyph span `aria-hidden`, classes `text-xl sm:text-2xl md:text-3xl text-fg select-none leading-none`. In-square coordinates `aria-hidden text-[0.55rem] sm:text-xs font-mono text-fg-subtle absolute`: rank number top-left square of the left-most rendered file (`left-0.5 top-0.5`), file letter bottom-right of bottom-row squares (`bottom-0.5 right-0.5`). Legal dot: `after:absolute after:content-[''] after:size-[22%] after:rounded-full after:bg-accent-chess` on empty targets. Glyph map: module-level `const GLYPHS: Record<Side, Record<PieceType, string>> = { w: { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" }, b: { k:"♔", q:"♕", r:"♖", b:"♗", n:"♘", p:"♙" } }`.

Drag state lives in ChessGame (ref + state for `{from, x, y} | null`); the floating glyph renders in ChessGame as `<span aria-hidden style={{left: x, top: y}} className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-3xl text-fg">{glyph}</span>`. Suppress the click after a real drag via a `didDragRef` checked in `onSquareClick`. While dragging, squares' `touch-manipulation` swaps to `touch-none` (class on the grid container is fine).

### 5.4 CREATE `components/chess/{PromotionDialog,MoveList,GameControls,GameStatus}.tsx`

- **PromotionDialog({ onPick, onCancel }):** `absolute inset-0 z-10 flex items-center justify-center bg-bg/70`; inner `rounded-lg border border-border bg-surface p-4`: eyebrow `Promote to` + row of four glyph buttons (`h-14 w-14 rounded-md border border-border bg-surface-2 text-3xl text-fg hover:border-border-strong`). Focus first button on mount (`useEffect` + ref); Escape = `onCancel`.
- **MoveList({ history }):** eyebrow `Moves`; empty → `<p className="mt-4 text-sm text-fg-subtle">No moves yet.</p>`; else `<div className="mt-4 lg:max-h-[32rem] lg:overflow-y-auto"><ol>` with rows `<li className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 border-b border-border py-1.5 font-mono text-sm">` = move number `text-fg-subtle`, white SAN, black SAN (`—` if none yet); latest pair `text-fg`, older `text-fg-muted`. Auto-scroll per locked decision 12.
- **GameControls({ state, callbacks }):** two chip groups + buttons per locked decision 11, in a `mt-6 space-y-4` column; group labels are the same eyebrow style. New game = `Button size="sm"` primary; Resign = ghost sm, only while playing, two-step text per locked rule.
- **GameStatus({ statusLine, result, onNewGame }):** `<p aria-live="polite" className="mb-4 font-mono text-xs uppercase tracking-widest text-fg-subtle">{statusLine}</p>` (mb spacing to the board), plus the §3.14 game-over panel when `result` exists.

### 5.5 MODIFY `app/chess/page.tsx` (keep `metadata` byte-identical; body becomes)

```tsx
<Container className="py-16 sm:py-24">
  <SectionHeading
    as="h1"
    title="Chess AI"
    description="Play against a chess model that runs entirely in your browser."
  />
  <p className="mt-8 max-w-prose text-fg-muted">
    Play a full game of chess in your browser. Every move is checked by a real
    rules engine, and the opponent runs entirely client-side — no server
    decides a single move.
  </p>
  <p className="mt-4 max-w-prose text-sm text-fg-subtle">
    The trained model hasn&apos;t been exported for the browser yet, so right now
    a heuristic stand-in opponent runs through the same interface it will use.
    Once accounts and verified rewards land in later phases, beating the AI
    will grant +5 JTB interactions.
  </p>
  <ChessGame />
</Container>
```

Drop `Tag`, the placeholder paragraph, and the `TODO(PHASE-4)` comment. No dynamic import wrapper — phase-3-style direct import is correct here (§5.1 of the phase-3 plan pattern; route splitting is the §17 mechanism).

### 5.6 Milestone B verification (run every command; the board SSRs — no browser needed for these checks)

```bash
npm run build 2>&1 | tee /tmp/b.log | grep -E "^Failed|error"       # expect no output
npm run lint && npm run format:check                                 # exit 0
npm ls chess.js                                                      # @1.x — still the only new dep
npm run dev & sleep 8
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/chess                    # 200
curl -s http://localhost:3000/chess | grep -o 'data-square="[a-h][1-8]"' | wc -l        # 64
curl -s http://localhost:3000/chess | grep -c 'aria-label="e2, white pawn"'             # 1
curl -s http://localhost:3000/chess | grep -c 'aria-label="e5, empty"'                  # 1
curl -s http://localhost:3000/chess | grep -c 'Your move'                               # 1 (initial status, SSR-deterministic)
curl -s http://localhost:3000/chess | grep -oE 'EASY|MEDIUM|HARD' | sort -u | wc -l     # 3
curl -s http://localhost:3000/chess | grep -c 'No moves yet'                            # 1
curl -s http://localhost:3000/chess | grep -c 'stand-in'                                # >= 1 (honesty copy present)
curl -s http://localhost:3000/chess | grep -c 'role="group" aria-label="Chess board"'   # 1 (board container)
curl -s http://localhost:3000/chess | grep -o 'aria-label="Chess board"' | wc -l        # 1
curl -s http://localhost:3000/chess | grep -oE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' | head   # NO output
curl -s http://localhost:3000/ | grep -c 'Chess board'                                  # 0 (nothing chess leaks to homepage)
grep -rn 'animate-\|duration-' components/chess/ app/chess/                             # NO output
grep -rn '"use client"' components/chess/ | wc -l                                       # 1 (ChessGame only)
kill %1
```

Then the honest-manual check you must state plainly in your final report: **click-path playability (drag, promotion dialog, resign confirm, AI replies across difficulties, play-as-black first move) cannot be verified via curl** — start `npm run dev`, play one full game as White and one as Black against each difficulty, and say in the report which flows you exercised.

**Optional final step:** update the two status lines in `CLAUDE.md` ("Phase 3 complete …" paragraph → Phase 4 chess UI complete with stand-in opponent; next up **Phase 5 — Supabase** per §34) and the `## Status` paragraph in `README.md`. Touch nothing else in either file — leave the fenced next-agent-rules block in CLAUDE.md byte-identical.

Commit (single, conventional):

```
feat(chess): build playable chess UI with client-side opponent

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 6. Drift risks — read before starting

| Risk | Guardrail |
|---|---|
| Installing react-chessboard / onnxruntime / tfjs / stockfish / icon packs | One new dep total: `chess.js@^1`. The `npm ls` checks enforce it. |
| Copy implying the opponent IS the trained model, or that rewards work now | Honesty rule #6 + locked copy in §5.5/§3.14; the `stand-in` grep must match. |
| Assuming chess.js `.move()` returns null on illegal (pre-1.0 docs/blogs) | §3.1 try/catch + null-check pattern; wrapper never throws on illegality. |
| Double AI moves in dev (React StrictMode effect double-invoke) | §5.1 token ref + per-effect `cancelled` flag — both required. |
| `Math.random()` during render → SSR/CSR hydration mismatch | Rule #4: initial state fully deterministic; randomness only in handlers/effects. |
| Importing React/DOM in `lib/chess/` → Phase 7 server reuse breaks | Hard rule #8 + the isomorphy grep in Milestone A verification. |
| 64 tab stops on one board | Roving tabindex (locked decision 5) — exactly one focusable square. |
| `touch-action: none` permanently killing page scroll over the board | `touch-manipulation` default; `touch-none` only during an active drag. |
| Drag + click double-firing one move | `didDragRef` suppresses the click after a real drag (§5.3). |
| `disabled` square buttons breaking keyboard focus | Rule #6: input gate in handlers, never the attribute. |
| Auto-queening on promotion | Promotion dialog is mandatory; AI always queens (locked decision 7). |
| Hard-coded square/piece colors or `animate-*` flourishes | Token locks in §3.2–§3.3; the hex/utility greps and the animation grep must be empty. |
| `"use client"` leaking into subcomponents or the page | One directive, in `ChessGame.tsx`; the `grep -c` check enforces it. |
| Deleting `.gitkeep` files | Keep every one, including `public/models/.gitkeep`. |
| Building reward submission / API routes / auth hooks "ahead of time" | Phases 5–7. Only `replayMoves` is built early, as the documented seam. |
| Editing Header/Footer, universe config, design page, Phase-3 pages | Out of scope. Touching them fails review. |

## 7. Execution order (exact)

**Milestone A** — commit once at the end:
1. `npm install chess.js@^1`; skim `node_modules/chess.js/README.md` for v1 field/method names
2. `types/chess.ts` (verbatim contract)
3. `lib/chess/engine.ts`
4. `lib/chess/opponents.ts`
5. Verification block 4.5 (every command) → fix → commit with the given message.

**Milestone B** — commit once at the end:
1. `components/chess/ChessGame.tsx` (`"use client"`, reducer, AI effect, drag state)
2. `components/chess/ChessBoard.tsx`
3. `components/chess/PromotionDialog.tsx`
4. `components/chess/MoveList.tsx`
5. `components/chess/GameControls.tsx`
6. `components/chess/GameStatus.tsx`
7. `app/chess/page.tsx`
8. Optional CLAUDE.md/README status lines
9. Verification block 5.6 (every command, plus the manual play-test report) → fix → commit with the given message.

## 8. Definition of done (§32 chess rows — this phase vs. what waits)

Satisfied by this phase:
- [ ] Chess board works (token board, tap-tap + drag + keyboard, orientation flip)
- [ ] Legal moves are enforced (chess.js is the only legality authority; UI routes every move through `tryMove`)
- [ ] AI makes legal moves (opponents pick only from `legal`; `{ok:false}` fallback path exists as a tripwire)
- [ ] Game termination works (checkmate, stalemate, threefold, insufficient material, fifty-move, resignation; result panel + New game)
- [ ] Mobile works (tap-tap primary, no scroll-hijack, responsive board + move list stacking)
- [ ] Model loading states work — honestly: an "Opponent is thinking…" state exists; real model-download states arrive with the ONNX artifact (§34 step 9 follow-up, gated on James exporting weights to `public/models/`)

Explicitly NOT satisfied here (later phases — say so in your report, do not fake):
- [ ] "James Chess AI loads client-side" — partial: the pipeline and interface exist and run client-side; the trained model weights do not exist yet.
- [ ] Completed games verified server-side → Phase 7 (the `replayMoves` seam is ready)
- [ ] Winning awards +5 JTB credits; reward not claimable repeatedly → Phases 5–7

And as always: `build`, `lint`, `format:check` green; exactly one new dep (`chess.js@^1`); zero new routes; zero fabricated claims anywhere.

## Deviation addendum (2026-09-01)

The phase-4 dependency freeze was broken deliberately: `onnxruntime-web@^1.29.0` was added when the trained policy networks shipped to `public/models/` (one dependency, lazy-loaded, wasm-only, self-hosted runtime). The "Opponent is thinking…" state grew into "Loading the opponent…" + "Opponent is thinking…" for the model path. The trained-model follow-up this phase deferred is now done — see `docs/notes/chess-model-training.md`.
