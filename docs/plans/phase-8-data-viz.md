# PHASE 8 — TABLEAU / POWER BI EMBEDS: Implementation Plan

> Executor: you are implementing **Phase 8 (Tableau / Power BI embeds)** of this Next.js portfolio, per master plan **§9, §9.1, §9.2, and §34 Phase 8** ("embeds, lazy loading, project descriptions, responsive behavior, fallback links" → deliverable: *Interactive Data Visualisation Lab*). Follow this document exactly. Do not invent features, routes, or dependencies. Do not touch 3D files (`components/universe/`, `lib/universe/`), the chess system, JTB, auth, or Supabase — all out of scope. Two milestones, **each ending in one conventional commit**. If you run low on budget, complete and commit Milestone A and stop: A ships the full embed machinery against placeholder content and is self-standing; B is content fill-in that depends on James publishing the two workbooks externally.

## 1. Context — the one fact that shapes this phase

The two source artifacts exist in the repo root as untracked files:

- `James_Imbuido_CoVid_Screener.twbx` (Tableau packaged workbook, **22 MB**)
- `James_Imbuido_spotify_2023_dashboard.pbix` (Power BI report, **3.6 MB**)

**Neither file can be embedded in a website.** `.twbx`/`.pbix` are desktop authoring formats — there is no browser renderer for them. Public web embedding requires publishing to the vendors' hosted services first:

- **Tableau** → publish the workbook to **Tableau Public** (free, public); the shareable view URL (`https://public.tableau.com/views/<workbook>/<sheet>`) is what gets embedded.
- **Power BI** → open the `.pbix` in Power BI Desktop, publish to the Power BI service, then **File → Embed report → Publish to web (public)**; the generated `https://app.powerbi.com/view?r=…` URL is what gets embedded (§9.2: "use the appropriate official embedding mechanism").

Both publishing steps require the vendor's desktop apps and James's accounts, so they are **James action items** (§6), not executor work. The executor's deliverable is the embed architecture: content-model support for embed URLs, click-to-load iframe components, responsive frames, fallback links, and honest "publishing pending" states for anything without a URL yet. The pages must look complete and honest **with or without** the URLs pasted in.

The seams were built for this in Phase 3:

- `types/project.ts` already has `EmbedType = "tableau" | "power_bi" | "python" | "interactive"` and the §9 visualisation fields (`businessContext`, `dataset`, `keyInsights`, `tools`, `embedType`).
- `components/visualisations/VizEmbedPlaceholder.tsx` is the explicit stand-in this phase replaces.
- `content/visualisations/` holds `example-tableau-dashboard.md` + `example-power-bi-dashboard.md` — all-TODO placeholders that get **renamed and partially filled** into the two real projects (real facts only: what the file names tell us; everything else stays `[TODO: James — …]`).
- `app/data/[slug]/page.tsx` renders the placeholder at one call site (line ~80); the rest of the case-study layout (Context / Key Insights / Technical Approach / Dataset / Tools) is already final per §9.1.

### Hard rules (violating any of these = failed milestone)

1. **Zero new dependencies, zero new environment variables.** Both embeds are plain `<iframe>`s. Do NOT add the Tableau Embedding API JS package, `powerbi-client`, or any npm wrapper — a static-optimized iframe satisfies §9.1/§9.2 with less weight and no CSP gymnastics.
2. **Design tokens only.** No hex codes, no `zinc-*`/`gray-*`/`slate-*` in new/edited UI. All surfaces/borders/text use the existing tokens (`bg-surface-2`, `border-border`, `text-fg-muted`, `text-fg-subtle`, etc.).
3. **Strict TypeScript, no `any`.** `npm run build` must type-check clean. Next.js 16.3.2 / React 19.2.8 — read `node_modules/next/dist/docs/` before touching any API you're unsure of.
4. **Lazy loading is click-to-load.** §17 forbids loading embeds until needed; Tableau/Power BI iframes pull megabytes of vendor JS. The component renders a lightweight poster (preview image if provided, else a branded placeholder surface) with an explicit "Load interactive dashboard" action; the iframe mounts only on click. `loading="lazy"` on the iframe as a second belt. No IntersectionObserver auto-load — a visitor scrolling past `/data/[slug]` should never trigger a vendor payload they didn't ask for.
5. **Fallback links always render** (§34 item: "fallback links") — "Open in Tableau Public ↗" / "Open in Power BI ↗" as a real anchor under the frame, available even before click and if iframes are blocked.
6. **URL validation is server-side at content-load.** `embedUrl` is validated in `lib/content/projects.ts`: https only, hostname allowlist per `embedType` (`*.tableau.com` for tableau, `app.powerbi.com` for power_bi). A non-conforming value throws at build time like any other invalid frontmatter. Values containing `TODO` are treated as absent (mirrors the `githubUrl`/`demoUrl` handling in `app/data/[slug]/page.tsx`) — never passed to a component.
7. **Honesty rule / content integrity (§7, CLAUDE.md):** no fabricated dashboard facts. The only facts the executor may assert about the two projects are derivable from the file names themselves (a COVID screening dashboard built in Tableau; a 2023 Spotify listening dashboard built in Power BI). Everything else — description, problem, approach, insights, dataset, tools — stays as clearly-marked `[TODO: James — …]` placeholders. The `[TODO]` filter chips must keep working: the example files' categories (`TABLEAU`, `POWER_BI`) already match `VIZ_FILTERS`.
8. **The workbooks are NOT committed to git.** 22 MB of binaries in the repo bloats every clone and Vercel build for zero site value — embeds come from the hosted vendors, not from these files. Milestone A adds `*.twbx` / `*.pbix` to `.gitignore`. The files stay on James's disk until publishing is done; do not delete them (they are the only publish source) but do not `git add` them either.
9. **Keep every existing `.gitkeep`.** `VizEmbedPlaceholder.tsx` is **deleted** in Milestone A only after its replacement is wired in (its comment says it stands in "until Phase 8 delivers embeds" — this is Phase 8); the `components/visualisations/.gitkeep` stays.

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TS strict, Tailwind v4 CSS-first (`app/globals.css`). `@/*` → repo root. npm only. No test framework by design — "done" is the acceptance list in §8. Prettier ignores `*.md`.
- `app/data/page.tsx`: filter grid over `getVisualisations()` with `VIZ_FILTERS` (ALL / TABLEAU / POWER BI / PYTHON / INTERACTIVE — last two match on `embedType`, not category).
- `app/data/[slug]/page.tsx`: full §9.1 layout; `dynamicParams = false` + `generateStaticParams` (adding a content file requires no code change — the build picks it up). `VizEmbedPlaceholder` imported at line 8, rendered around line 80 with `embedType={project.embedType ?? "interactive"}`.
- `lib/content/projects.ts`: server-only frontmatter loader; `validateProject` throws on missing required fields / bad types; **`embedUrl` does not exist yet** — you add it (§4.1).
- `types/project.ts`: `Project` interface; `embedUrl` absent — you add it.
- `components/visualisations/`: only `VizEmbedPlaceholder.tsx` + `.gitkeep`.
- UI primitives: `Button({ variant?: "primary"|"secondary"|"ghost", size?: "sm"|"md"|"lg", href?, onClick?, disabled? })` — with `href` renders a link-styled anchor, without one a real `<button>`.
- No CSP headers are configured in `next.config.*` (iframes to tableau.com / powerbi.com are unrestricted). Do not add CSP in this phase — that's a Phase 9/10 hardening task; note it in §8 as deferred.
- Two untracked binaries in repo root (the workbooks); nothing else untracked. `README.md` and `CLAUDE.md` have Phase-status sentences you update in Milestone A (§4.7).

## 3. Locked decisions (do not redesign)

1. **One content field: `embedUrl?: string`.** No `provider` enum, no per-vendor config objects — `embedType` already discriminates, and each vendor's full embed URL is self-describing. The component maps `embedType` → iframe title/allow attributes.
2. **One client component, one server wrapper.**
   - `components/visualisations/LazyEmbed.tsx` (`"use client"`): the click-to-load state machine (`poster → loading → ready | error`), the iframe, and the fallback link. Props: `embedType: "tableau" | "power_bi"`, `embedUrl: string`, `title: string`, `previewImage?: string`.
   - `components/visualisations/VisualisationEmbed.tsx` (server): decides what renders for a `Project`. `embedType` tableau/power_bi **with** a validated `embedUrl` → `<LazyEmbed>`; without one → an honest "publishing pending" panel (design-token surface, mono placeholder copy like the existing placeholder style). `python`/`interactive` → the same panel with "custom visualisation planned" copy. This file replaces `VizEmbedPlaceholder` at the `[slug]` call site.
3. **Iframe attributes:** `title={title}`, `className="absolute inset-0 h-full w-full border-0"`, `loading="lazy"`, `referrerPolicy="no-referrer-when-downgrade"`. **No `sandbox`** — both vendors' interactive dashboards require scripts/forms inside the frame; a sandbox would render them broken. The URL allowlist in `lib/content/projects.ts` is the injection boundary instead (only https, only the two vendor hosts, validated at build time from repo-controlled markdown — there is no user-supplied input on this path at all).
4. **Responsive frame:** `relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-2`. 16:9 matches both vendors' default dashboard aspect; the iframe absolutely fills it. Power BI publish-to-web scales internally; Tableau's view URL used with the plain embed params renders responsively in the iframe. No fixed pixel heights anywhere.
5. **Tableau embed URL params:** the URL James pastes is the share link (`https://public.tableau.com/views/<wb>/<sheet>`). `LazyEmbed` appends `?:showVizHome=no&:embed=true&:tabs=yes` (exactly once — guard if the pasted URL already contains `?`) before mounting the iframe. Document this in the component comment; Power BI URLs are used verbatim.
6. **Loading failure is detectable only heuristically** — cross-origin iframes fire `onLoad` even for vendor error pages, and `X-Frame-Options` blocks produce a blank frame plus a console error the page cannot observe. So: after the iframe mounts, show a timed hint ("Taking too long? Open in Tableau Public ↗") that appears after ~8 s and never replaces the frame. Do not pretend to detect vendor errors — the always-visible fallback link (hard rule 5) is the real guard.
7. **Preview images are optional and file-based:** frontmatter `image: /visualisations/covid-screener.png` points into `public/visualisations/`. If the file doesn't exist the poster falls back to the placeholder surface — **no `next/image` with remote vendor URLs, no screenshot automation**. James exports PNGs from the desktop apps (§6). Use `next/image` (`fill`, `sizes="(max-width: 768px) 100vw, 896px"`, `className="object-cover"`) for the poster when an image exists.
8. **Content files renamed, not orphaned:** `example-tableau-dashboard.md` → `covid-screener-dashboard.md`; `example-power-bi-dashboard.md` → `spotify-2023-dashboard.md`. Categories/`embedType` unchanged. The **only** frontmatter fields the executor edits in Milestone A: `title` (from the file names: "COVID-19 Screening Dashboard" / "Spotify 2023 Listening Dashboard"), `technologies` (["Tableau"], ["Power BI"]), `tools` (["Tableau Public"], ["Power BI Desktop", "Power BI Service"]), and adds `embedType`-matching placeholder `embedUrl: "TODO"` lines so the schema seam is visible. Every other field keeps its `[TODO: James — …]` value verbatim.
9. **`/data` index needs no change** — `ProjectGrid`/`ProjectCard` already render from the content loader; the two renamed files flow through automatically. Do not add badges or "interactive" chips in this phase (no unnecessary abstractions).
10. **Milestone split:** A = content model + components + page wiring + renamed content + `.gitignore` + status lines (fully verifiable without the vendor URLs). B = James pastes real `embedUrl`s (+ optional PNGs) → executor verifies each URL serves a real vendor page, checks the live embeds in Playwright, updates CLAUDE/README status to "complete", commits content-only. B's verification gates on James's §6 actions.

## 4. Milestone A — embed architecture (commit once at the end)

### 4.1 EXTEND the content model

`types/project.ts` — append to the §9 block:

```ts
  embedType?: EmbedType;
  /** Public vendor URL (Tableau Public / Power BI publish-to-web). Validated host-allowlisted in lib/content/projects.ts; absent or "TODO" → poster panel, never an iframe. */
  embedUrl?: string;
```

`lib/content/projects.ts` — in `validateProject`, after the existing array checks:

```ts
  const embedUrl = data.embedUrl;
  if (embedUrl !== undefined && typeof embedUrl !== "string") {
    throw new Error(
      `Invalid frontmatter in ${filePath}: "embedUrl" must be a string`,
    );
  }
  if (
    typeof embedUrl === "string" &&
    !embedUrl.includes("TODO")
  ) {
    const allowlist: Record<string, (host: string) => boolean> = {
      tableau: (h) => h === "public.tableau.com" || h.endsWith(".tableau.com"),
      power_bi: (h) => h === "app.powerbi.com",
    };
    const embedType = data.embedType as string | undefined;
    const allowed = embedType && allowlist[embedType];
    let parsed: URL;
    try {
      parsed = new URL(embedUrl);
    } catch {
      throw new Error(
        `Invalid frontmatter in ${filePath}: "embedUrl" is not a valid URL`,
      );
    }
    if (parsed.protocol !== "https:" || (allowed && !allowed(parsed.hostname))) {
      throw new Error(
        `Invalid frontmatter in ${filePath}: "embedUrl" must be an https URL on the vendor host for embedType "${String(embedType)}"`,
      );
    }
  }
```

and add `embedUrl: data.embedUrl as string | undefined,` to the returned object (after `embedType`).

### 4.2 CREATE `components/visualisations/LazyEmbed.tsx`

```tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

type LoadState = "poster" | "loading" | "ready";

const VENDOR_LABEL: Record<string, string> = {
  tableau: "Tableau Public",
  power_bi: "Power BI",
};

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/**
 * Click-to-load third-party dashboard iframe (§17: embeds never load until
 * asked for). Tableau share URLs get the standard embed params; Power BI
 * publish-to-web URLs are used verbatim. The vendor host is already pinned by
 * the frontmatter allowlist in lib/content/projects.ts — no sandbox here
 * (interactive dashboards need vendor scripts); the allowlist is the boundary.
 */
export function LazyEmbed({
  embedType,
  embedUrl,
  title,
  previewImage,
}: {
  embedType: "tableau" | "power_bi";
  embedUrl: string;
  title: string;
  previewImage?: string;
}) {
  const [state, setState] = useState<LoadState>("poster");
  const [showSlowHint, setShowSlowHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vendor = VENDOR_LABEL[embedType] ?? "dashboard provider";
  const src =
    embedType === "tableau" && !embedUrl.includes("?")
      ? `${embedUrl}?:showVizHome=no&:embed=true&:tabs=yes`
      : embedUrl;

  useEffect(() => {
    if (state !== "loading") return;
    // Cross-origin iframes fire onLoad even on vendor error pages and give no
    // error signal we can read — so the slow-hint is the only honest affordance.
    timerRef.current = setTimeout(() => setShowSlowHint(true), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  return (
    <div className="mt-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-2">
        {state === "poster" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {previewImage && (
              <Image
                src={previewImage}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 896px"
                className="object-cover opacity-40"
              />
            )}
            <p className="relative font-mono text-xs uppercase tracking-widest text-fg-subtle">
              Interactive {vendor} dashboard
            </p>
            <div className="relative">
              <Button size="sm" onClick={() => setState("loading")}>
                Load interactive dashboard
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            title={title}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setState("ready")}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
      <p className="mt-3 text-sm text-fg-subtle">
        {showSlowHint && state !== "ready"
          ? "Taking too long? "
          : "Prefer full-screen? "}
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClasses}
        >
          Open in {vendor} ↗
        </a>
      </p>
    </div>
  );
}
```

### 4.3 CREATE `components/visualisations/VisualisationEmbed.tsx` and rewire the page

```tsx
import type { Project } from "@/types/project";
import { LazyEmbed } from "@/components/visualisations/LazyEmbed";

const VENDOR_LABEL: Record<string, string> = {
  tableau: "Tableau Public",
  power_bi: "Power BI",
};

/**
 * §9.1/§9.2 embed slot. A validated vendor URL renders the click-to-load
 * embed; anything else renders an honest pending panel — never a fake chart.
 */
export function VisualisationEmbed({ project }: { project: Project }) {
  const embedUrl =
    project.embedUrl && !project.embedUrl.includes("TODO")
      ? project.embedUrl
      : undefined;

  if (
    (project.embedType === "tableau" || project.embedType === "power_bi") &&
    embedUrl
  ) {
    return (
      <LazyEmbed
        embedType={project.embedType}
        embedUrl={embedUrl}
        title={project.title}
        previewImage={project.image}
      />
    );
  }

  const copy =
    project.embedType === "tableau" || project.embedType === "power_bi"
      ? `${project.title} — publishing to ${VENDOR_LABEL[project.embedType]} in progress; the interactive dashboard embeds here once live.`
      : `${project.title} — custom ${(project.embedType ?? "interactive").replaceAll("_", " ")} visualisation planned.`;

  return (
    <div className="mt-8 flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 p-6">
      <p className="max-w-prose text-center font-mono text-xs uppercase tracking-widest text-fg-subtle">
        {copy}
      </p>
    </div>
  );
}
```

`app/data/[slug]/page.tsx`: replace the `VizEmbedPlaceholder` import and usage:

```tsx
import { VisualisationEmbed } from "@/components/visualisations/VisualisationEmbed";
// …
<VisualisationEmbed project={project} />
```

Then **delete** `components/visualisations/VizEmbedPlaceholder.tsx` and grep to confirm zero remaining imports.

### 4.4 RENAME + edit the two content files

```bash
git mv content/visualisations/example-tableau-dashboard.md content/visualisations/covid-screener-dashboard.md
git mv content/visualisations/example-power-bi-dashboard.md content/visualisations/spotify-2023-dashboard.md
```

Edits per §3.8 — for the Tableau file: `title: "COVID-19 Screening Dashboard"`, `technologies: ["Tableau"]`, `tools: ["Tableau Public"]`, append `embedUrl: "TODO: James — paste the Tableau Public view URL"`. For the Power BI file: `title: "Spotify 2023 Listening Dashboard"`, `technologies: ["Power BI"]`, `tools: ["Power BI Desktop", "Power BI Service"]`, append `embedUrl: "TODO: James — paste the publish-to-web URL"`. **Every other `[TODO]` stays.** Add `image: "/visualisations/covid-screener.png"` / `"…/spotify-2023.png"` lines marked TODO-adjacent in a comment, or omit `image` entirely until B — your call; simplest is omit.

### 4.5 MODIFY `.gitignore` (workbook exclusion, hard rule 8)

```gitignore
# dashboard workbooks (publish source only — never shipped; embeds come from Tableau Public / Power BI)
*.twbx
*.pbix
```

### 4.6 Create `public/visualisations/.gitkeep`

So the PNG drop-zone for Milestone B exists.

### 4.7 Status lines (same commit)

Update `CLAUDE.md` `## Current state`: replace "**Phase 8 — Tableau / Power BI embeds** per §34" next-up clause with Phase 8 in-progress wording: embed architecture live (click-to-load iframe, vendor-host allowlist, fallback links), awaiting James's Tableau Public / Power BI publish + real `embedUrl`s. Leave the fenced next-agent-rules block byte-identical. Mirror in `README.md`'s status paragraph.

### 4.8 Milestone A verification (run every step; report plainly)

```bash
npm run build 2>&1 | grep -E "^Failed|error"   # expect no output (type-check clean)
npm run lint && npm run format:check            # both exit 0
npm ls | tail -n +2 | wc -l                     # dependency count unchanged
grep -rnE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' components/visualisations/  # NO output
grep -rn "VizEmbedPlaceholder" app components lib                               # NO output
git status --porcelain | grep -E "twbx|pbix"    # NO tracked/staged binaries
ls public/visualisations/.gitkeep
```

Content validation proof — temporarily set `embedUrl: "http://evil.example.com/x"` in one file, run `npm run build`, confirm it **fails** with the allowlist error, revert. Report that you ran this tripwire.

Playwright MCP against `npm run dev`:

1. `/data` — both renamed projects appear; the TABLEAU chip shows only the COVID dashboard, POWER BI only Spotify; ALL shows both.
2. `/data/covid-screener-dashboard` — page renders: title, tag, all §9.1 sections, the honest pending panel (mono copy, dashed border), **zero network requests to tableau.com or powerbi.com** (check the network panel — this is the lazy-loading proof).
3. Same for `/data/spotify-2023-dashboard`.
4. Old slugs `/data/example-tableau-dashboard` and `/data/example-power-bi-dashboard` → 404 (params are static).
5. Mobile viewport (~390 px) — pending panel keeps aspect, copy wraps, nothing overflows horizontally.

Commit:

```
feat(data): add click-to-load embed architecture for Tableau and Power BI

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 5. Milestone B — real embeds live (BLOCKED on James's §6 actions)

Only start after James has pasted real URLs and (optionally) dropped the PNGs in `public/visualisations/`.

1. Confirm each `embedUrl` is real: `curl -sI <url> | head -1` → 200/302 on the vendor host; the allowlist already ran at build time.
2. `npm run build && npm run lint && npm run format:check` green.
3. Playwright MCP, `/data/<slug>` per project:
   - Poster renders (PNG if provided); **no vendor requests before click**.
   - Click "Load interactive dashboard" → iframe mounts → requests to public.tableau.com / app.powerbi.com appear → dashboard is visibly interactive (hover/click a mark) → no horizontal overflow at 1280 and 390 px.
   - "Open in …" link points at the exact pasted URL and opens a new tab (`target="_blank"` + `rel="noopener noreferrer"`).
4. Update `CLAUDE.md` / `README.md` status to **Phase 8 complete**.

Commit:

```
feat(data): embed live Tableau and Power BI dashboards

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 6. James action items (between A and B — nothing can embed until these are done)

1. **Tableau:** open `James_Imbuido_CoVid_Screener.twbx` in Tableau Desktop/Public → **Server → Tableau Public → Save to Tableau Public As…** → once published, open the workbook in the browser and copy the view URL (`https://public.tableau.com/views/…`). It will be **public to anyone** — confirm the COVID data is fine to publish (it was built for a portfolio, so presumably yes; say it on the project page either way).
2. **Power BI:** open the `.pbix` in Power BI Desktop → **Publish** (needs a free Power BI account; "My workspace" is fine) → in app.powerbi.com, open the report → **File → Embed report → Publish to web (public)** → accept the public-access warning → copy the link (not the full iframe snippet — just the URL). §9.2's rule holds: nothing private in this dataset.
3. **Screenshots (optional but recommended):** export one PNG per dashboard (~1600×900) → `public/visualisations/covid-screener.png` and `spotify-2023.png`.
4. **Paste the URLs** into the two content files' `embedUrl` fields, and **fill the remaining `[TODO]` frontmatter** — description, problem, approach, businessContext, dataset, keyInsights. Real facts only.
5. Once both are published, delete the local `.twbx`/`.pbix` from the repo root (gitignore keeps them out; they're only publish sources).

## 7. Drift risks — read before starting

| Risk | Guardrail |
|---|---|
| Trying to embed the `.twbx`/`.pbix` directly (JS parsers, `tableau-react`, `powerbi-client`) | §1 context — the formats have no browser renderer; publishing to the vendor services is the only path. Hard rule 1: zero new deps. |
| Committing 26 MB of binary workbooks | §4.5 gitignore + the `git status` tripwire in §4.8. |
| Auto-loading vendor JS on page view (IntersectionObserver, bare iframe) | Hard rule 4 — click-to-load only; §4.8 step 2 proves zero vendor requests pre-click. |
| `sandbox`ed iframe "for safety" breaking the dashboards | §3.3 decision; the content-side host allowlist is the boundary because this path has no user input at all. |
| Accepting any URL into the iframe | §4.1 allowlist runs at build; §4.8 tripwire proves it fails closed. |
| Fabricated dashboard copy to make pages look "done" | Hard rule 7 / §3.8 — title/technologies/tools from file names only; everything else stays `[TODO]`. |
| Pretending to detect iframe load errors | §3.6 — slow-hint + permanent fallback link is the honest ceiling. |
| `git mv` not preserving history / orphaned example slugs | §4.4 commands; §4.8 404 check. |
| Tableau pasted URL already carrying `?` params → double query string | §3.5 guard — append params only when no `?` present. |
| Editing `[slug]` layout beyond the one-line swap | The §9.1 sections were finalized in Phase 3 — only the import + component call change. |

## 8. Definition of done

Satisfied by Milestone A:
- [ ] `embedUrl` in `Project`, host-allowlisted at content load (§4.1), TODO-treated-as-absent
- [ ] Click-to-load `LazyEmbed` + responsive 16:9 frame + permanent vendor fallback link (§4.2–4.3)
- [ ] `[slug]` renders real `VisualisationEmbed`; `VizEmbedPlaceholder` deleted; zero stray imports
- [ ] Two real-named project pages from renamed example files; honest pending panels; filters work
- [ ] Workbooks gitignored, untracked; `public/visualisations/` scaffolded
- [ ] build/lint/format green, zero new deps/env, Playwright walkthrough incl. no-pre-click-vendor-requests proof and allowlist tripwire
- [ ] §34 Phase 8 items "embeds (machinery), lazy loading, responsive behavior, fallback links" demonstrably true in code

Satisfied by Milestone B (after James's §6):
- [ ] Both dashboards embed live and interactive; responsive at desktop + mobile widths; fallback links verified
- [ ] All `[TODO]` frontmatter replaced by James's real content; key insights genuine
- [ ] Status lines: **Phase 8 complete — Interactive Data Visualisation Lab live**

Explicitly NOT in this phase (say so in the report):
- [ ] PYTHON / INTERACTIVE filter chips producing empty results (no such projects exist yet — that's content, not code)
- [ ] CSP / `frame-ancestors` headers (Phase 9/10 hardening), vendor embed performance tuning (Phase 9)
- [ ] JTB KB `visualisation.md` content update (separate content task — do recommend it as follow-up once B lands, since JTB's grounding file still calls visualisations placeholder)
