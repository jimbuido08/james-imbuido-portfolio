/**
 * Server-only module: imports `node:fs` (via lib/content/markdown); never
 * import from client components.
 */
import { readMarkdownFile } from "@/lib/content/markdown";
import { isPlaceholder } from "@/lib/content/trust";

/**
 * Fixed section order (§7). Only these nine files are read — nothing else can
 * reach the model, so JTB is grounded exclusively in content/jtb/. Exported so
 * scripts/kb-sync.ts can report which files are placeholder-only rather than
 * silently dropping them.
 */
export const JTB_KB_FILES = [
  "about",
  "experience",
  "education",
  "skills",
  "projects",
  "ml",
  "ai",
  "career",
  "faq",
] as const;

/** One grounded section: the file slug plus its body after placeholder stripping. */
export interface JtbSection {
  section: string;
  content: string;
}

/**
 * Any line carrying the placeholder marker (the rule lives in
 * lib/content/trust.ts) is stripped before the KB reaches the model, so
 * placeholder copy can never be grounded as fact. Content authors write real
 * copy in place of the marker lines to activate a section.
 */

/**
 * ONE owner of the knowledge-base framing. Every context that reaches
 * buildSystemPrompt — the whole-KB fallback in lib/jtb/turn.ts and the
 * retrieved subset in lib/jtb/retrieval.ts — is assembled through here, so a
 * retrieved context is byte-identical to the same sections inside the whole-KB
 * string and the prompt builder needs to know about neither.
 */
export function formatKnowledgeBaseSections(
  sections: ReadonlyArray<JtbSection>,
): string {
  return sections.map((s) => `## ${s.section}\n\n${s.content}`).join("\n\n");
}

// Module-scope cache: content is static markdown shipped with the build.
let cached: JtbSection[] | null | undefined;

/**
 * Loads the JTB knowledge base as per-section records, or null when nothing
 * real is available (missing directory, unreadable file, or every section
 * filtered out). The route treats null as "unavailable" (503) and never calls
 * the LLM — fail closed. This is the only thing that may produce
 * kb_unavailable: retrieval can narrow a healthy KB, never mask a broken one.
 */
export function loadKnowledgeBaseSections(): JtbSection[] | null {
  if (cached !== undefined) return cached;

  const sections: JtbSection[] = [];

  for (const file of JTB_KB_FILES) {
    const md = readMarkdownFile("jtb", file);
    if (!md) {
      cached = null; // missing dir or unreadable file → fail closed
      return cached;
    }
    const filtered = md.content
      .split("\n")
      .filter((line) => !isPlaceholder(line))
      .join("\n")
      .trim();
    if (filtered) sections.push({ section: file, content: filtered });
  }

  cached = sections.length > 0 ? sections : null;
  return cached;
}
