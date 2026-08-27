# PHASE 3 — PORTFOLIO CONTENT: Implementation Plan

> Executor: you are implementing **Phase 3** of a Next.js portfolio, in **two milestones (A then B), each ending in one conventional commit**. Follow this document exactly. Do not invent features, routes, dependencies, or portfolio facts. Do not touch 3D files (`components/universe/`, `lib/universe/`), `app/page.tsx`, `app/design/page.tsx`, `components/navigation/*`, Supabase, chess, or JTB files — all out of scope. If you run low on budget, complete and commit Milestone A and stop; A is self-standing.

## 1. Context

Phase 1 built the design system (tokens, UI primitives, Header/Footer). Phase 2 built the 3D homepage and placeholder routes. Phase 3 replaces four placeholders with real structured pages and builds the structured project system (content files → loader → components → routes) for `/ai-ml` + `/ai-ml/[slug]`. Authoritative source: `James Imbuido — Interactive Data Universe Portfolio _ Master Project Plan.md`; the relevant sections are restated here so you never need to guess.

### Hard rules (violating any of these = failed milestone)

1. **Never fabricate portfolio facts.** Every biographical sentence, project detail, metric, URL, and email you write must be a literal marker: `[TODO: James — <what James should write here>]`. The only real facts allowed on pages: name "James Imbuido", role "Data Scientist", employer "Commonwealth Bank of Australia", the transition "nursing → data science". Everything else is a marked placeholder.
2. **Design tokens only.** No hex codes, no `zinc-*`/`gray-*`/`slate-*` utilities, no gradients/glow/glassmorphism. Allowed utilities come from `app/globals.css` `@theme`: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-accent-{ai,jtb,chess,neut}`, `text-focus`, `font-sans`, `font-mono` (plus opacity variants like `border-accent-ai/40`).
3. **Exactly one new dependency in the whole phase: `gray-matter` v4 (Milestone B).** Do not install anything else — not `framer-motion`, not `server-only`, not `remark`/`react-markdown`/`mdx`, not `zod`, not icon libraries. (CLAUDE.md lists Framer Motion in the stack; it is NOT installed and MUST NOT be installed in this phase.)
4. **Strict TypeScript, no `any`.** `npm run build` must type-check clean. Do NOT annotate components with `JSX.Element` — React 19 removed the global `JSX` namespace; let return types be inferred.
5. **Next 16 API notes (this codebase runs Next 16.3.2 — older Next knowledge will betray you):** `params`/`searchParams` in pages are **Promises** — always `await` them. Typed global helpers `PageProps<'/route'>` / `LayoutProps<'/route'>` exist, no import needed (`app/layout.tsx` already uses `LayoutProps<"/">`). Dynamic pages: export `generateStaticParams()` and set `export const dynamicParams = false;` so unknown slugs 404. Use `notFound()` from `next/navigation`; do not create custom `not-found.tsx` files.
6. **Icons:** use plain-text labels (`Email`, `LinkedIn`, `GitHub`) with a trailing `↗` styled `text-fg-subtle`. No SVG assets, no icon packages.
7. **Keep every existing `.gitkeep`** even after adding real files to those directories.

## 2. Current repo state (verified — do not assume otherwise)

- Next.js **16.3.2** App Router, React **19.2.8**, TS strict, Tailwind v4 CSS-first (all config in `app/globals.css`; no `tailwind.config.*`). `@/*` → repo root. npm only. No test framework by design. Prettier ignores `*.md`, so content files and this document are never format-checked.
- All six placeholder pages (`app/{about,experience,ai-ml,jtb,chess,contact}/page.tsx`) share one template; here is `app/about/page.tsx` verbatim — the others differ only in title/description, `Tag domain`, and the TODO phase number:

```tsx
import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "About — James Imbuido",
  description: "Who I am and how I work.",
};

export default function AboutPage() {
  return (
    <Container className="py-16 sm:py-24">
      <Tag domain="neutral">Placeholder</Tag>
      <SectionHeading
        as="h1"
        title="About"
        description="Who I am and how I work."
        className="mt-4"
      />
      <p className="mt-8 max-w-prose text-fg-muted">
        This section is under construction. Full bio and story land in Phase 3.
        Placeholder content.
      </p>
      {/* TODO(PHASE-3): real content per master plan §8.1 content model */}
    </Container>
  );
}
```

- Primitives in `components/ui/` (importable as `@/components/ui/<Name>`):
  - `Container` — `mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8`, div-props passthrough.
  - `SectionHeading({ kicker?, title, description?, as?: "h1"|"h2"|"h3", className? })` — h1 = `text-4xl … md:text-6xl`; kicker = mono uppercase eyebrow; `className` lands on the wrapper div.
  - `Tag({ domain: "ai"|"jtb"|"chess"|"neutral", children, className? })`.
  - **`Button({ variant?: "primary"|"secondary"|"ghost", size?: "sm"|"md"|"lg", href?, className?, children, ...buttonProps })` — CRITICAL: when `href` is set it renders `next/link` Link and `buttonProps` are NOT forwarded (only className+children). Extra props (`disabled`, `type`, `aria-pressed`, `onClick`) only work on the no-`href` `<button>` path.**
  - `Card` (`interactive?: boolean` adds `transition-colors hover:border-border-strong`; base `rounded-lg border border-border bg-surface p-6`), `CardHeader` (`space-y-3`), `CardTitle` (an `h3`, `text-xl font-semibold tracking-tight`), `CardDescription` (`text-sm leading-relaxed text-fg-muted`), `CardFooter` (`mt-4`).
  - `cx(...classes)` from `@/lib/utils` — conditional class join; no clsx dep.
- Empty dirs awaiting you (keep their `.gitkeep`): `content/projects/`, `types/`, `components/projects/`. `lib/content/` does not exist yet — create it.
- Header/Footer each render the same nav links from `lib/navigation.ts`; `lib/universe/config.ts` holds the universe nodes. **Neither is yours to change.**
- Scripts: `npm run build | lint | format | format:check`. "Done" = §8 verification.

## 3. Locked decisions (do not redesign)

1. **Content format:** frontmatter-only markdown, one file per entry, parsed with `gray-matter@4`. The markdown body stays empty (a one-line HTML comment). Justification: master plan §15 mandates structured markdown in `content/`; frontmatter parsing is the concrete requirement; no body rendering ⇒ no remark/mdx dep.
2. **Loader** `lib/content/projects.ts`: Node `fs`/`path` + `gray-matter`, synchronous module reads (fine for build-time SSG), hand-rolled runtime validation (no validation lib — §33). No `server-only` package: importing `fs` already makes any client-side import fail the build; a header comment documents the rule.
3. **One flat `Project` type** in `types/project.ts`; no base/subclass or discriminated union (§33 simplicity).
4. **Category enum** = §23 enum extended with `CLASSICAL_ML` and `AGENTS`, forced by §3.3's filter list; the divergence is documented in code comments.
5. **Filter chips:** `/ai-ml` per §3.3 = `ALL · AI / ML · LLM · NLP · CLASSICAL ML · AGENTS · EXPERIMENTS` (the `AI / ML` chip is ONE chip matching category `AI` or `ML`).
6. **Components:** three in `components/projects/` (`ProjectCard`, `ProjectGrid`, `CaseStudySections`). Only `ProjectGrid` is `"use client"` (filter state). Predicate functions live in `lib/content/filters.ts` and are **imported directly inside the client grid** — never passed as props (functions don't survive the RSC boundary).
7. **About/Experience/Education copy is inline in the page components** (§15 reserves `content/` for projects/jtb). A shared `Timeline` component at `components/experience/Timeline.tsx`. **Education is a labelled section on `/experience`**, not its own route (§10/§15 define no `/education`; §32's "Education exists" is satisfied by the section).
8. **Contact:** server-rendered link list + **fully disabled** form shell (inputs and submit all `disabled`) with an honest note. No `app/api/contact`, no `mailto:` action.
9. **No status `Tag` on rebuilt pages.** Placeholder honesty is communicated solely by inline `[TODO: James — …]` markers styled `font-mono text-fg-subtle`.
10. **Header/Footer nav duplication and `UniverseDomain`/`TagDomain` duplication:** untouched. Out of scope.
11. **No `loading.tsx`/`error.tsx`.** Pages are fully static; the empty state lives in `ProjectGrid`; unknown slugs use built-in 404.
12. Placeholder honesty styling: wrap every `[TODO: James — …]` marker in `<span className="font-mono text-fg-subtle">`.

## 4. Milestone A — About, Experience + Education, Contact

### 4.1 CREATE `components/experience/Timeline.tsx` (server)

Shared vertical timeline for the Experience and Education sections.

```ts
export interface TimelineEntry {
  period: string;       // e.g. "2023 — Present" or a TODO marker
  title: string;        // role or qualification
  organisation: string; // employer or institution
  summary: string;      // 1–3 sentences, TODO-marked
}

export function Timeline({ entries }: { entries: TimelineEntry[] })
```

Render an `<ol className="mt-10 space-y-8">`; each `<li>` is a two-column grid row (`grid gap-2 sm:grid-cols-[10rem_1fr] sm:gap-8`, with `border-t border-border pt-8` on every item except the first): left column `period` in `font-mono text-xs text-fg-subtle`; right column = `<h3 className="text-xl font-semibold tracking-tight">` (title), `<p className="text-sm text-fg-muted">` (organisation), `<p className="mt-2 text-sm leading-relaxed text-fg-muted">` (summary). No dots/lines/flourishes — the plainest implementation that matches the design language.

### 4.2 MODIFY `app/about/page.tsx` (server; replace everything below the metadata)

Metadata object: keep `title`, replace description with:
`"Who James Imbuido is — from nursing to data science, and how he thinks about technology."`

Body, inside `<Container className="py-16 sm:py-24">`, exact order, sections separated by `mt-16`:

1. `<SectionHeading as="h1" title="About" description="<same new description>" />` — drop the Tag entirely.
2. `<SectionHeading as="h2" kicker="Introduction" title="Who I am" />` + 2–3 paragraphs; every clause is a `<span className="font-mono text-fg-subtle">[TODO: James — write your personal introduction: who you are, where you're based, what you're interested in]</span>`.
3. `<SectionHeading as="h2" kicker="Journey" title="Nursing → Data Science" />` + paragraphs. The ONE real sentence permitted: "James began his career in nursing before transitioning into data science." Everything about why/how/when is a TODO-marked span.
4. `<SectionHeading as="h2" kicker="Approach" title="How I think about technology" />` + TODO-marked philosophy paragraphs.
5. Closing actions: `<Button href="/contact" variant="secondary">Get in touch</Button>` and `<Button href="/experience" variant="ghost" className="ml-3">See experience</Button>`.

Paragraph class recipe everywhere: `mt-6 max-w-prose text-base leading-relaxed text-fg-muted`. Delete the `Tag` import and the `TODO(PHASE-3)` comment.

### 4.3 MODIFY `app/experience/page.tsx` (server)

Metadata: title `"Experience — James Imbuido"`; description `"Professional experience and education — data scientist at Commonwealth Bank of Australia."`

Structure:

1. `<SectionHeading as="h1" title="Experience" description="<metadata description>" />`.
2. `<SectionHeading as="h2" kicker="Career" title="Professional experience" className="mt-16" />` then `<Timeline entries={experienceEntries} />`. `experienceEntries` is a module-level const. **First entry (the real anchor):** `period: '[TODO: James — start date] — Present'`, `title: "Data Scientist"`, `organisation: "Commonwealth Bank of Australia"`, `summary: '[TODO: James — describe your role, team, and the problems you work on. 2–3 sentences. Never invent metrics.]'`. Then one more fully-placeholder entry for prior career (`[TODO: James — your nursing career or prior role: title, organisation, dates, summary]` in every field).
3. `<SectionHeading as="h2" kicker="Education" title="Education" description="Degrees, certifications, and structured learning." className="mt-16" />` then `<Timeline entries={educationEntries} />` with two placeholder entries (degree; certifications/bootcamps) — every field `[TODO: James — …]`. This labelled section is the Education deliverable (§32), deliberately here because §10 defines no `/education` route.
4. Delete the `Tag` and `TODO(PHASE-3)` comment.

### 4.4 MODIFY `app/contact/page.tsx` (server)

Metadata: title `"Contact — James Imbuido"`; description `"How to reach James Imbuido — email, LinkedIn, GitHub."`

Structure:

1. `<SectionHeading as="h1" title="Contact" description="<metadata description>" />`.
2. `<SectionHeading as="h2" kicker="Direct" title="Find me" className="mt-16" />` + `<ul className="mt-6 space-y-3">` with three rows: Email, LinkedIn, GitHub. Values are all placeholders, so per the honesty rule **render each row as plain text, not a link**: `<li><span className="text-fg">Email</span> — <span className="font-mono text-fg-subtle">[TODO: James — your email address]</span></li>`. When James fills real values later, the row becomes `<a className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong" href="…">Label <span className="text-fg-subtle">↗</span></a>` — leave a code comment showing that target shape.
3. `<SectionHeading as="h2" kicker="Message" title="Send a message" description="This form will be wired to a server route in a later phase — it does not send yet." className="mt-16" />` then `<form className="mt-6 max-w-prose space-y-5">` (no `action`, no client JS):
   - Field pattern (all three): `<label htmlFor="{id}" className="block text-sm text-fg-muted">Label</label>` + control with classes `mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40` — and EVERY control gets `disabled`.
   - `Name`: `<input id="contact-name" name="name" type="text" autoComplete="name" disabled … />`
   - `Email`: `<input id="contact-email" name="email" type="email" autoComplete="email" disabled … />`
   - `Message`: `<textarea id="contact-message" name="message" rows={5} disabled …></textarea>`
   - `<Button type="submit" disabled>Send message</Button>` followed by `<p className="text-sm text-fg-subtle">This form is not connected yet — it will be handled by a server route in a later phase. Until then, use email or LinkedIn above.</p>`
   - A disabled form with disabled controls cannot be submitted or activated by keyboard; add no JS.
4. Delete the `Tag` and `TODO(PHASE-3)` comment.

### 4.5 Milestone A verification (run every command; text-only, no screenshots)

```bash
npm run build 2>&1 | grep -E "Compiled successfully|error"          # expect "Compiled successfully", no errors
npm run lint && npm run format:check                                # both exit 0
npm run dev & sleep 8
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/about        # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/experience   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/contact      # 200
curl -s http://localhost:3000/about      | grep -c "TODO: James"     # expect >= 3
curl -s http://localhost:3000/experience | grep -c "TODO: James"     # expect >= 4
curl -s http://localhost:3000/experience | grep -c "Education"       # expect >= 2
curl -s http://localhost:3000/contact    | grep -c 'disabled'        # expect >= 4
curl -s http://localhost:3000/about | grep -oE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' | head   # expect NO output
curl -s http://localhost:3000/jtb   | grep -c "Placeholder"          # 1 — untouched pages keep their placeholder state
kill %1
```

Commit (single, conventional):

```
feat(portfolio): build about, experience, education, and contact pages

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 5. Milestone B — Project content system

### 5.1 Dependency + types

```bash
npm install gray-matter@4        # the ONLY new dependency of the entire phase
```

**CREATE `types/project.ts` (verbatim — this is the locked data contract):**

```ts
/** §23 categories, extended with CLASSICAL_ML and AGENTS per §3.3's filter list. */
export type ProjectCategory =
  | "AI"
  | "ML"
  | "CLASSICAL_ML" // §3.3 filter; not in §23 — documented divergence
  | "LLM"
  | "NLP"
  | "AGENTS" // §3.3 filter; not in §23 — documented divergence
  | "ENGINEERING"
  | "EXPERIMENT";

export interface Project {
  // §23 core
  slug: string; // derived from filename — never written in frontmatter
  title: string;
  category: ProjectCategory;
  description: string;
  featured: boolean;
  technologies: string[];
  problem: string;
  approach: string;
  results: string;
  lessons: string;
  githubUrl?: string;
  demoUrl?: string;
  image?: string;
  interactive: boolean;
  // §8.1 case-study fields (ML pages); empty string = section omitted
  data: string;
  models: string;
  evaluation: string;
}
```

### 5.2 CREATE `lib/content/filters.ts` (pure module, NO `fs` — safe to import from client code)

```ts
import type { Project } from "@/types/project";

export interface FilterDef {
  key: string;
  label: string;
  matches: (project: Project) => boolean;
}

/** §3.3 — /ai-ml. "AI / ML" is ONE chip matching either category. */
export const AI_ML_FILTERS: FilterDef[] = [
  { key: "all", label: "ALL", matches: () => true },
  { key: "ai-ml", label: "AI / ML", matches: (p) => p.category === "AI" || p.category === "ML" },
  { key: "llm", label: "LLM", matches: (p) => p.category === "LLM" },
  { key: "nlp", label: "NLP", matches: (p) => p.category === "NLP" },
  { key: "classical-ml", label: "CLASSICAL ML", matches: (p) => p.category === "CLASSICAL_ML" },
  { key: "agents", label: "AGENTS", matches: (p) => p.category === "AGENTS" },
  { key: "experiments", label: "EXPERIMENTS", matches: (p) => p.category === "EXPERIMENT" },
];
```

### 5.3 CREATE `lib/content/projects.ts` (server-only — header comment: "Server-only module: imports `fs`; never import from client components.")

Exported API (signatures to implement exactly):

```ts
export function getProjects(): Project[];              // content/projects/
export function getProjectBySlug(slug: string): Project | undefined;
```

Implementation recipe (follow it; do not improvise): one private `readDir(kind: "projects"): Project[]` that (1) resolves `path.join(process.cwd(), "content", kind)`; (2) **returns `[]` if the directory is missing, empty, or has no `*.md` files — emptiness never throws**; (3) for each file parses `matter(source)` and uses `data` only (body ignored); (4) sets `slug` from the filename minus `.md`; (5) runs `validateProject(data, filePath)` which throws `Error(\`Invalid frontmatter in ${file}: <reason>\`)` when a required field is missing/mistyped, `category` is outside the enum, or `technologies` is not `string[]`; (6) applies defaults before validation returns: `featured ??= false`, `interactive ??= false`, `data ??= ""`, `models ??= ""`, `evaluation ??= ""`; (7) sorts `featured` first, then `title` A–Z. The slug getter does `readDir(kind).find(...)`. **Malformed content fails the build loudly; an empty directory renders an empty state silently.**

### 5.4 CREATE 2 placeholder content files

`content/projects/example-classical-ml-project.md` (category `ML`, `featured: true`), `content/projects/example-llm-project.md` (category `LLM`, `featured: false`). Every human-facing string contains a `TODO: James` marker. Verbatim skeleton:

```md
---
title: "[TODO: James — project title]"
category: ML
description: "[TODO: James — one sentence on what this project does]"
featured: true
technologies:
  - "[TODO: James — technology]"
problem: "[TODO: James — what problem were you solving?]"
data: "[TODO: James — what data was used?]"
approach: "[TODO: James — how did you approach the problem?]"
models: "[TODO: James — which models were tested?]"
evaluation: "[TODO: James — which metrics and why? Never invent numbers.]"
results: "[TODO: James — what was achieved? No fabricated metrics.]"
lessons: "[TODO: James — what did you learn?]"
interactive: false
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->
```

Single-line YAML scalars are fine for placeholders; block scalars (`|-`) are permitted when James later writes real copy.

### 5.5 Components

**CREATE `components/projects/ProjectCard.tsx` (server):**

```ts
import type { Project } from "@/types/project";

export function ProjectCard({ project, hrefBase }: { project: Project; hrefBase: string })
// hrefBase is "/ai-ml"
```

Composition: `<Card interactive>` → `<CardHeader>` containing: a flex row (`flex flex-wrap gap-2`) with `<Tag domain="ai">{project.category.replaceAll("_", " ")}</Tag>` (plus `<Tag domain="neutral">Interactive</Tag>` when `project.interactive`); `<CardTitle>` wrapping a `next/link` `<Link href={\`${hrefBase}/${project.slug}\`} className="hover:text-fg-muted transition-colors">` around the title text (the title is the single link — the whole card is NOT a link, simplest a11y); `<CardDescription>{project.description}</CardDescription>` → `<CardFooter>` with `<p className="font-mono text-xs text-fg-subtle">{project.technologies.join(" · ")}</p>`, then `↗ GitHub` / `↗ Demo` as `<a className="text-sm text-fg-muted underline underline-offset-4 decoration-border hover:decoration-border-strong">` — **render only when the URL exists AND does not contain `TODO`**. No images this phase.

**CREATE `components/projects/ProjectGrid.tsx` (the ONLY client component — `"use client"` at the very top of the file):**

```ts
"use client";

import { useState } from "react";
import type { Project } from "@/types/project";

export function ProjectGrid({
  projects,
  filters,
  hrefBase,
  emptyMessage,
}: {
  projects: Project[];
  filters: { key: string; label: string }[]; // serializable projection from the SERVER page
  hrefBase: string;
  emptyMessage: string;
})
```

Inside: `useState<string>("all")` for the active filter key; resolve the active predicate by importing `AI_ML_FILTERS` **directly in this file** from `@/lib/content/filters` and finding by key. Matcher functions never cross the RSC boundary — that's why props carry only `{ key, label }`.

Render: filter bar `<div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Project filters">` of `<Button key={f.key} variant={active ? "secondary" : "ghost"} size="sm" aria-pressed={active} onClick={() => setActive(f.key)}>` (Button forwards button props on the no-href path — use that path). Grid `<div className="mt-8 grid gap-6 sm:grid-cols-2">` of `<ProjectCard>` for the filtered list. Filtered-empty state: `<p className="mt-12 text-center text-sm text-fg-subtle">{emptyMessage}</p>`. When `projects.length === 0` (empty content dir) show the same state with `"No projects published yet — content is being written."` and skip the filter bar.

**CREATE `components/projects/CaseStudySections.tsx` (server):**

```ts
export function CaseStudySections({ project }: { project: Project })
```

Renders §8.1 in FIXED order: Problem, Data, Approach, Models, Evaluation, Results, Lessons, Technical Stack, Links. String sections: `<section>` + `<SectionHeading as="h2" title={label} className="mt-14" />` + body `<p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">`, splitting the field on `\n\n` into multiple paragraphs. **Skip a section when the field is `""` — but render it when it still contains `TODO: James`** (placeholder honesty beats emptiness). Technical Stack: `<ul className="mt-4 flex flex-wrap gap-2">` of `<li><Tag domain="neutral">{tech}</Tag></li>`. Links: ghost Buttons `↗ GitHub` / `↗ Live demo` (via `href`) for set, TODO-free `githubUrl`/`demoUrl`; omit the section when neither qualifies.

### 5.6 Routes

**MODIFY `app/ai-ml/page.tsx` (server):** keep/refresh static `metadata` (title `"AI/ML — James Imbuido"`; description `"Machine learning, LLM, and AI engineering projects."`). Body: `SectionHeading as="h1"` +:

```tsx
<ProjectGrid
  projects={getProjects()}
  filters={AI_ML_FILTERS.map(({ key, label }) => ({ key, label }))}
  hrefBase="/ai-ml"
  emptyMessage="No AI/ML projects match this filter."
/>
```

Drop the `Tag` and `TODO(PHASE-3)` comment.

**CREATE `app/ai-ml/[slug]/page.tsx` (server) — exact pattern (params is a Promise; `PageProps` is a global typed helper, no import):**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { CaseStudySections } from "@/components/projects/CaseStudySections";
import { getProjectBySlug, getProjects } from "@/lib/content/projects";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/ai-ml/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: "Project not found — James Imbuido" };
  return {
    title: `${project.title} — James Imbuido`,
    description: project.description,
  };
}

export default async function ProjectPage({
  params,
}: PageProps<"/ai-ml/[slug]">) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();
  return (
    <Container className="py-16 sm:py-24">
      <Button href="/ai-ml" variant="ghost" size="sm">
        ← All AI/ML projects
      </Button>
      <div className="mt-6 flex flex-wrap gap-2">
        <Tag domain="ai">{project.category.replaceAll("_", " ")}</Tag>
        {project.featured && <Tag domain="neutral">Featured</Tag>}
      </div>
      <SectionHeading
        as="h1"
        title={project.title}
        description={project.description}
        className="mt-4"
      />
      <CaseStudySections project={project} />
    </Container>
  );
}
```

**Optional final step of Milestone B:** update the two status lines in `CLAUDE.md` ("Next up: **Phase 3 — …**" → Phase 3 complete, next is Phase 4 chess UI per §34) and the `## Status` paragraph in `README.md`. Touch nothing else in either file (in particular leave the fenced next-agent-rules block in CLAUDE.md byte-identical).

### 5.7 Milestone B verification

```bash
npm ls gray-matter                                        # expect gray-matter@4.x
npm ls framer-motion remark react-markdown zod server-only 2>&1 | head -6   # expect "(empty)" for each
npm run build 2>&1 | tee /tmp/b.log | grep -E "^Failed|error"               # expect no output
grep -E "ai-ml/\[slug\]" /tmp/b.log                        # route listed as SSG/static
npm run lint && npm run format:check                       # exit 0
npm run dev & sleep 8
for r in /ai-ml /ai-ml/example-classical-ml-project /ai-ml/example-llm-project; do
  echo -n "$r: "; curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000$r"
done                                                        # all three 200
echo -n "unknown slug: "; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/ai-ml/does-not-exist   # 404
curl -s http://localhost:3000/ai-ml | grep -c "TODO: James"                 # >= 2
curl -s http://localhost:3000/ai-ml/example-classical-ml-project | grep -cE 'Problem|Approach|Evaluation|Technical Stack'   # = 4 (§8.1 order present)
grep -rE '#[0-9a-fA-F]{6}|(zinc|gray|slate)-[0-9]+' app/ai-ml app/about app/experience app/contact components/projects components/experience types lib/content   # expect NO output
grep -rn 'github.com/james\|linkedin.com/in/\|james.*@' content/ app/ --include='*.md' --include='*.tsx'   # expect NO real-looking URLs/emails
kill %1
# Negative-path check: mv content/projects /tmp/; npm run build must still succeed (empty state renders); mv it back.
```

Commit (single, conventional):

```
feat(projects): markdown content model and /ai-ml project system

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 6. Drift risks — read before starting

| Risk | Guardrail |
|---|---|
| Inventing real-sounding bios, metrics, employers, URLs, emails | Every human-visible placeholder string contains `TODO: James`; the verification greps for real-looking URLs/emails must print nothing. |
| Installing `framer-motion`, `remark`, `zod`, icon packs, `server-only`, clsx | One new dep total: `gray-matter@4`. The `npm ls` checks enforce it. |
| Hard-coded colors / `zinc-*` / `gray-*` / `slate-*` / gradients / glow | The hex/utility grep in verification must be empty. Tokens only. |
| Old-Next patterns: sync `params`, `getStaticProps`, `next/head`, custom `not-found.tsx` | Next 16.3.2: `await params`, `PageProps<'/route'>` global helper, `generateStaticParams` + `dynamicParams = false`, `notFound()` → built-in 404. |
| Annotating components `JSX.Element` | React 19 removed the global `JSX` namespace → type error. Omit return-type annotations. |
| Passing matcher functions as props to `ProjectGrid` | RSC serialization error at runtime. Props carry only `{ key, label }[]`; predicates are imported inside the client component from `@/lib/content/filters`. |
| `"use client"` on pages/cards/sections, or missing on `ProjectGrid` | Only `ProjectGrid.tsx` opens with `"use client"`. Everything else is a server component. |
| Rendering `↗ GitHub`/`↗ Demo`/`↗ Live demo` for TODO placeholder URLs | Rule: build the link only when the URL is set AND contains no `TODO`. |
| Throwing when `content/*/` is empty (build breaks) | Loader returns `[]`; grid shows the empty state. Negative-path check in verification. |
| Deleting `.gitkeep` files | Keep every one, including in dirs you populate. |
| "Improving" Header/Footer/universe config/design page | Out of scope. Touching them fails review. |
| Adding categories (e.g. `DEEP_LEARNING`) or splitting the `AI / ML` chip | Enum locked in `types/project.ts`; chips locked in `lib/content/filters.ts` per §3.3 as written here. |
| Two `generateStaticParams` making pages async for no reason / forgetting `await params` anywhere | Copy the verbatim `[slug]` skeleton in §5.6. |

## 7. Execution order (exact)

**Milestone A** — commit once at the end:
1. `components/experience/Timeline.tsx`
2. `app/about/page.tsx`
3. `app/experience/page.tsx`
4. `app/contact/page.tsx`
5. Verification block 4.5 (every command) → fix → commit with the given message.

**Milestone B** — commit once at the end:
1. `npm install gray-matter@4`
2. `types/project.ts`
3. `lib/content/filters.ts`
4. `lib/content/projects.ts`
5. The two placeholder content files (§5.4)
6. `components/projects/ProjectCard.tsx`
7. `components/projects/ProjectGrid.tsx` (`"use client"`)
8. `components/projects/CaseStudySections.tsx`
9. `app/ai-ml/page.tsx`
10. `app/ai-ml/[slug]/page.tsx`
11. Optional CLAUDE.md/README status lines
12. Verification block 5.7 (every command, including negative-path) → fix → commit with the given message.

## 8. Definition of done (§32 portfolio rows this phase satisfies)

- [ ] About exists (structured sections; nursing → data science transition; philosophy — honestly TODO-marked)
- [ ] Experience exists (CBA Data Scientist anchor on a timeline)
- [ ] Education exists (labelled section + timeline on `/experience`)
- [ ] Contact exists (placeholder links + honestly-disabled form shell)
- [ ] ML projects exist (`/ai-ml` grid + §3.3 filters + `/ai-ml/[slug]` §8.1 case studies, SSG + 404 correct)
- [ ] `build`, `lint`, `format:check` green; exactly one new dep (`gray-matter@4`); zero fabricated facts anywhere.

