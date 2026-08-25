/**
 * Server-only module: imports `node:fs` (via lib/content/markdown); never
 * import from client components.
 */
import { readMarkdownFile } from "@/lib/content/markdown";
import { isPlaceholder } from "@/lib/content/trust";

/**
 * Fixed section order (§7). Only these ten files are read — nothing else can
 * reach the model, so JTB is grounded exclusively in content/jtb/.
 */
const KB_FILES = [
  "about",
  "experience",
  "education",
  "skills",
  "projects",
  "ml",
  "ai",
  "visualisation",
  "career",
  "faq",
] as const;

/**
 * Any line carrying the placeholder marker (the rule lives in
 * lib/content/trust.ts) is stripped before the KB reaches the model, so
 * placeholder copy can never be grounded as fact. Content authors write real
 * copy in place of the marker lines to activate a section.
 */

// Module-scope cache: content is static markdown shipped with the build.
let cached: string | null | undefined;

/**
 * Loads the JTB knowledge base as one concatenated string, or null when
 * nothing real is available (missing directory, unreadable file, or every
 * section filtered out). The route treats null as "unavailable" (503) and
 * never calls the LLM — fail closed.
 */
export function loadKnowledgeBase(): string | null {
  if (cached !== undefined) return cached;

  const sections: string[] = [];

  for (const file of KB_FILES) {
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
    if (filtered) sections.push(`## ${file}\n\n${filtered}`);
  }

  cached = sections.length > 0 ? sections.join("\n\n") : null;
  return cached;
}
