# PHASE 1 — DESIGN SYSTEM: Implementation Plan

> Executor: you are implementing **Phase 1** of a Next.js portfolio. Follow this document exactly. Do not invent features, routes, or dependencies beyond what is listed. Do not build anything 3D, Supabase, chess, or chatbot-related — those are later phases and are explicitly out of scope here.

---

## 1. Context

This repo is the personal portfolio of James Imbuido (a data scientist). Its eventual homepage is a 3D "Data Universe" (React Three Fiber), but the 3D layer must **always** sit on top of a fully working conventional site. Phase 0 (an empty Next.js scaffold) is complete and committed. Phase 1 builds the shared visual foundation — design tokens, typography, UI primitives, navigation, footer — so every later feature page inherits one consistent system.

The authoritative requirements live in `James Imbuido — Interactive Data Universe Portfolio _ Master Project Plan.md`, sections §12 (Visual Design), §13 (Typography), §15 (Structure), §18 (Accessibility), and §28 (Phases). You do not need to read the whole plan; the relevant requirements are restated in this document.

### Deliverable (per §28 Phase 1)

A **polished non-3D shell** the whole site will inherit:
- Typography scale, color tokens, spacing rhythm
- `Button`, `Card`, `Container`, `SectionHeading`, `Tag` primitives
- Site header with responsive navigation + footer
- Dark theme as the default and only theme (no light/dark toggle)
- Everything accessible, responsive from the start, zero new runtime dependencies

### Visual direction (per §12 — non-negotiable)

Dark, premium, minimal, technical, high-contrast, restrained palette. **Avoid:** gradients, neon, glow, glassmorphism, rounded-everything, generic AI imagery. Accent colors exist **strategically** — each portfolio domain gets one accent; they are identity markers, not decoration.

---

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TypeScript strict, **Tailwind CSS v4** (CSS-first config via `@tailwindcss/postcss`; there is **no `tailwind.config.*` file** in v4 style), ESLint 9 flat config, Prettier.
- `app/layout.tsx` already loads `Geist` and `Geist_Mono` via `next/font/google` as CSS vars `--font-geist-sans` / `--font-geist-mono`. **Keep these fonts** — §13 lists Geist as a preferred option.
- `app/globals.css` is the default template (light/dark via `prefers-color-scheme`). **Replace it.** The site is dark-only.
- `app/page.tsx` is a placeholder hero. Replace it with a version built on the new primitives.
- `tsconfig.json` path alias: `@/*` → `./*`. Use `@/components/...`, `@/lib/...` imports everywhere.
- `components/` contains **empty** folders: `ui/`, `navigation/`, `universe/`, `jtb/`, `chess/`, `projects/`. Only `ui/` and `navigation/` are in scope now.
- `lib/` contains empty folders; only a top-level `lib/utils.ts` is in scope now.
- npm scripts: `dev`, `build`, `lint` (eslint), `format` / `format:check` (prettier; `*.md` files are excluded via `.prettierignore`).
- No test framework exists **by design**. "Done" = the acceptance checklist in §7 below.

---

## 3. Design tokens (concrete values — implement these exactly)

All tokens live as CSS custom properties in `app/globals.css` using Tailwind v4's `@theme` block, so they become real utilities (`bg-surface`, `text-fg-muted`, `border-border`, etc.). **Never hard-code a hex or a `zinc-*`/`gray-*` utility in a component** — components consume tokens only.

### 3.1 Color tokens

| Token                  | Value      | Purpose                                        |
| ---------------------- | ---------- | ---------------------------------------------- |
| `--color-bg`           | `#0A0A0B`  | Page background (near-black)                   |
| `--color-surface`      | `#131316`  | Cards, header, raised panels                   |
| `--color-surface-2`    | `#1A1A1F`  | Secondary/hover surfaces, code blocks          |
| `--color-border`       | `#26262C`  | Hairline borders everywhere                    |
| `--color-border-strong`| `#3A3A42`  | Focused/hover borders, dividers of emphasis    |
| `--color-fg`           | `#F4F4F5`  | Primary text (off-white)                       |
| `--color-fg-muted`     | `#A1A1AA`  | Secondary text                                 |
| `--color-fg-subtle`    | `#71717A`  | Tertiary: captions, metadata, footer           |
| `--color-accent-ai`    | `#818CF8`  | AI/ML domain accent (soft indigo)              |
| `--color-accent-jtb`   | `#D9A03F`  | JTB chatbot accent (desaturated amber/gold)    |
| `--color-accent-chess` | `#4DA37E`  | Chess AI accent (muted emerald)                |
| `--color-accent-neut`  | `#9CA3AF`  | Experience / neutral domain accent             |

Do **not** add gradients, glows, or drop-shadow color effects. Shadows may only be neutral black at low opacity, and sparingly.

Add a `--color-focus: #8FB0FF` (or reuse `--color-accent-ai`) for the global focus ring (§18).

### 3.2 Typography (§13)

Fonts: Geist Sans (body/UI) and Geist Mono (code, labels, metadata) — already wired in `app/layout.tsx`. In `@theme`, map `--font-sans` and `--font-mono` to those CSS vars (this replaces the current `@theme inline` block).

Define this scale as theme entries (extend, don't replace Tailwind's defaults — just document the intended usage):

| Use                  | Classes                                        |
| -------------------- | ---------------------------------------------- |
| Display/H1           | `text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl` |
| H2 (section)         | `text-2xl font-semibold tracking-tight sm:text-3xl` |
| H3                   | `text-xl font-semibold tracking-tight`         |
| Body                 | `text-base leading-relaxed text-fg-muted`      |
| Small/caption        | `text-sm text-fg-subtle`                        |
| Eyebrow/kicker label | `font-mono text-xs uppercase tracking-[0.2em] text-fg-subtle` |

### 3.3 Spacing, radius, layout rhythm

- Page container: `max-w-5xl` with `px-4 sm:px-6 lg:px-8` (a real site should feel editorial, not full-bleed).
- Section vertical rhythm: `py-16 sm:py-24`.
- Corner radius: restrained — `rounded-md` (6px) for buttons/inputs, `rounded-lg` (8px) for cards. **No `rounded-2xl`+ blobs.**
- In `@theme`, add `--radius` overrides only if needed; default scale is fine.

### 3.4 Global accessibility CSS (§18)

Add to `globals.css`:
- A visible `:focus-visible` style: 2px outline using `--color-focus`, `outline-offset: 2px`.
- `@media (prefers-reduced-motion: reduce)`: force `scroll-behavior: auto`, and set `animation-duration`/`transition-duration` to `0.01ms` globally as a safe default.
- `html { scroll-behavior: smooth; }` under no-preference only.
- Selection color using a domain-neutral token (e.g., `::selection { background: var(--color-surface-2); }`).

---

## 4. Files to create

Create exactly these files. Each component: TypeScript strict (no `any`), named export, `React.ComponentProps<...>` passthrough where natural, `className` merge-friendly (accept optional `className` and append with a space-separated template — do **not** add `clsx`/`tailwind-merge`; no new dependencies this phase).

### 4.1 `app/globals.css` — full rewrite

Structure (Tailwind v4):

```css
@import "tailwindcss";

/* 1. Design tokens */
@theme {
  --color-bg: #0a0a0b;
  --color-surface: #131316;
  /* ...all tokens from §3.1 ... */
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* 2. Base layer */
@layer base {
  html { ... }        /* dark bg, smooth scroll under no-preference */
  body { ... }        /* bg-bg text-fg font-sans antialiased */
  ::selection { ... }
  :focus-visible { ... }
  @media (prefers-reduced-motion: reduce) { ... }
}
```

Delete the old `:root` light/dark variables and the old `@media (prefers-color-scheme: dark)` block entirely.

### 4.2 `lib/utils.ts`

```ts
/** Merge conditional class names without a dependency. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
```

All components accept `className?: string` and compose with `cx(base, className)`.

### 4.3 `components/ui/Button.tsx`

- Polymorphism is overkill: render a `next/link` `Link` when `href` is provided, else a `<button>`.
- Variants: `primary` (bg-fg text-bg, hover slightly muted — inverted, high contrast, NOT an accent color), `secondary` (transparent, `border-border`, hover `border-border-strong bg-surface-2`), `ghost` (no border, hover bg-surface-2).
- Sizes: `sm` (`h-9 px-3 text-sm`), `md` (`h-10 px-4 text-sm`), `lg` (`h-12 px-6 text-base`).
- Base: `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors` + `focus-visible` handled globally.
- Props: `{ variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; href?: string; className?: string; children }` plus native button props spread when rendering a button.

### 4.4 `components/ui/Card.tsx`

- `<article>` or `<div>` with: `rounded-lg border border-border bg-surface p-6`, optional hover affordance prop `interactive?: boolean` adding `transition-colors hover:border-border-strong`.
- Sub-components (named exports, same file): `Card.Header`, `Card.Title` (h3 scale), `Card.Description` (`text-sm text-fg-muted`), `Card.Footer` — implement as small components `CardHeader`, `CardTitle`, etc. exported and also attached as properties if convenient; the simple version (separate named exports) is fine.

### 4.5 `components/ui/Tag.tsx`

- Small domain badge: `font-mono text-xs uppercase tracking-wider rounded-md border px-2 py-0.5`.
- Prop `domain: "ai" | "data" | "jtb" | "chess" | "neutral"` mapping text/border color to the matching `accent-*` token at muted emphasis (e.g. `text-accent-ai border-accent-ai/40`). Nothing filled — outline style only (restraint, §12).

### 4.6 `components/ui/Container.tsx`

- `div` with `mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8` + `className` merge. Props: `ComponentProps<"div">`.

### 4.7 `components/ui/SectionHeading.tsx`

- Props: `{ kicker?: string; title: string; description?: string; className?: string }`.
- Renders: optional kicker in the eyebrow/mono style (§3.2), `h2` at section scale, optional description `text-fg-muted max-w-prose`.
- Semantic: heading level configurable via optional `as?: "h1" | "h2" | "h3"` defaulting to `h2`.

### 4.8 `components/navigation/Header.tsx`

- Sticky top: `sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur` (backdrop blur is fine; glassmorphism *panels* are not).
- Left: wordmark `James Imbuido` (font-semibold, links to `/`).
- Center/right desktop nav (`hidden md:flex`): links — `About`, `Experience`, `AI/ML`, `JTB`, `Chess`, `Contact` → `/about`, `/experience`, `/ai-ml`, `/jtb`, `/chess`, `/contact` (per §10; these routes don't exist yet — that's expected, links render anyway).
- Active link state using `usePathname()` from `next/navigation` → this makes Header a Client Component (`"use client"`). Active = `text-fg`, inactive = `text-fg-muted hover:text-fg transition-colors`; underline or left-border accent is optional — keep it typographic.
- Mobile (`md:hidden`): a real accessible disclosure menu — `<button aria-expanded aria-controls="mobile-nav">` toggling a panel (simple conditional render + `useState` is fine; no Framer Motion yet). Menu icon: inline SVG hamburger/× (no icon dependency). Panel: vertical link list, same routes, closes on navigation.
- The header is the **conventional navigation fallback** required by §11.1 — it must be fully functional with JS-disabled-at-runtime expectations aside (Next Link handles routing; the toggle requires JS, which is acceptable for V1).

### 4.9 `components/navigation/Footer.tsx`

- Server component. `border-t border-border`, inside a `Container`: left = `© 2026 James Imbuido` (use `new Date().getFullYear()`), right = secondary nav of the same routes in `text-sm text-fg-subtle`. Two rows on mobile (`flex-col`), one row `sm:flex-row justify-between`.

### 4.10 `app/layout.tsx` — edit

- Keep fonts/metadata wiring. Wrap children: `<Header />` then `<main className="flex-1">{children}</main>` then `<Footer />`. Body keeps `min-h-full flex flex-col`.
- Update metadata: title `James Imbuido — Data Scientist`, description per existing (fine as-is); add `metadataBase` placeholder comment is unnecessary — skip. **Do not** add Open Graph/Twitter cards yet (that's Phase 10/SEO).

### 4.11 `app/page.tsx` — replace placeholder

A minimal shell homepage proving the primitives (the Data Universe replaces this in Phase 2+ — keep it simple):
- Full-height-ish hero (`flex min-h-[70vh] items-center`): Container → kicker `Data × AI × Interactive Systems`, `h1` `James Imbuido`, subtitle `Data Scientist` in `text-fg-muted`, and a `Button` `[ Explore ]`-style CTA linking to `/about` with a secondary `Button` to `/contact`.
- Below: one section using `SectionHeading` + a `Card` grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`) showing the five domains (About, Experience, AI/ML, JTB, Chess AI) as linked Cards, each with its `Tag` domain badge and a one-line **placeholder** description. Mark descriptions clearly as placeholders, e.g. `PLACEHOLDER — describe this section` wording is NOT to be visible; instead use honest neutral copy like "Interactive overview — content in progress." **Never fabricate achievements, metrics, employers, or technologies** (content-integrity rule).

### 4.12 `app/design/page.tsx` — internal preview page

- A temporary, unlinked showcase of every primitive + token swatch (all colors as labeled swatches, the type scale, buttons × variants × sizes, tags × domains, card compositions). Wrap each group in `SectionHeading`.
- Add `export const metadata = { title: "Design System", robots: { index: false, follow: false } }` so it never gets indexed.
- Purpose: visual verification of Phase 1. It may be deleted or kept in later phases; note that in the commit.

---

## 5. Out of scope for this phase — do not touch

- No new npm dependencies (no framer-motion, no three/@react-three/*, no @supabase/*, no clsx, no icon libraries — inline SVG only).
- No new routes besides `/design` and `/`. Do not scaffold `/about` etc. (Phase 3).
- No 3D/universe code (`components/universe/` stays empty), no Supabase, no JTB, no chess, no API routes.
- No light theme / theme toggle.
- No global state, no context providers.

---

## 6. Step-by-step execution order

1. Rewrite `app/globals.css` with tokens + base layer (§4.1).
2. Create `lib/utils.ts` (`cx`).
3. Create UI primitives in order: `Container`, `Tag`, `Button`, `Card`, `SectionHeading`.
4. Create `Header` (Client Component) and `Footer`.
5. Wire `app/layout.tsx`.
6. Replace `app/page.tsx` hero + domain card grid.
7. Create `app/design/page.tsx` showcase.
8. Run verification (§7). Fix everything it flags.
9. Update `CLAUDE.md` "Current state" section: Phase 1 complete — describe tokens, primitives, nav shell; note Phase 2 (Data Universe prototype) is next per §34. Keep the rest of the file untouched.
10. Update `README.md`'s status line similarly if it has one (it describes Phase 0 scaffold status).
11. Single commit: `feat: Phase 1 design system — tokens, UI primitives, site shell` with the standard `Co-Authored-By: Claude <noreply@anthropic.com>` line kept as-is from the repo's convention.

---

## 7. Verification checklist (all must pass before committing)

Run from repo root:

```bash
npm run format        # then re-check formatting is clean
npm run format:check
npm run lint          # zero errors, zero warnings you introduced
npm run build         # must succeed — includes full type-check
npm run dev           # manual/visual pass
```

Manual checks in the browser at `http://localhost:3000`:

- `/` renders: header with wordmark + 7 nav links, hero per §4.11, domain card grid, footer. No visual regressions on reload.
- `/design` shows every token swatch, the type scale, all button variants/sizes, all tag domains, card compositions.
- Resize to ~375px width: mobile hamburger button appears, opens/closes, links work, nothing overflows horizontally.
- Keyboard: `Tab` from page top — every header link, the mobile toggle, hero CTAs, and card links show the **visible focus ring**; `Enter`/`Space` activates the toggle.
- Emulate `prefers-reduced-motion: reduce` (DevTools Rendering tab): no smooth-scroll/animation remains.
- Header links to not-yet-existing routes (e.g. `/about`) — a Next.js 404 is expected and fine; the active-state logic must not crash on any pathname.
- DevTools console: zero errors, zero warnings.

If anything fails, fix and re-run the full checklist.

---

## 8. Definition of done

- All files in §4 created/edited exactly as specified; nothing from §5 touched.
- Full §7 checklist green.
- `git status` clean after the single commit in §6 step 11.
- CLAUDE.md + README reflect "Phase 1 complete; next: Phase 2 Data Universe prototype."
