/**
 * Server-only module: imports `node:fs`; never import from client components.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

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
 * Any line containing this marker is stripped before the KB reaches the
 * model, so placeholder copy can never be grounded as fact. Content authors
 * write real copy in place of the marker lines to activate a section.
 */
const PLACEHOLDER_MARKER = "[TODO: James";

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

  const dir = path.join(process.cwd(), "content", "jtb");
  const sections: string[] = [];

  try {
    for (const file of KB_FILES) {
      const filePath = path.join(dir, `${file}.md`);
      const filtered = readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => !line.includes(PLACEHOLDER_MARKER))
        .join("\n")
        .trim();
      if (filtered) sections.push(`## ${file}\n\n${filtered}`);
    }
  } catch {
    cached = null; // missing dir or unreadable file → fail closed
    return cached;
  }

  cached = sections.length > 0 ? sections.join("\n\n") : null;
  return cached;
}
