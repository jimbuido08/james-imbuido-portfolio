/**
 * Shared markdown substrate for everything under content/ — the one place that
 * resolves the content directory, reads files, and parses frontmatter. The
 * project/visualisation loader (lib/content/projects.ts) and the JTB knowledge
 * base (lib/jtb/knowledge-base.ts) both read through here, so path handling and
 * gray-matter parsing live in exactly one seam.
 *
 * Server-only module: imports `node:fs`; never import from client components.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/** Absolute path to a content kind directory, e.g. content/projects. */
export function contentDir(kind: string): string {
  return path.join(process.cwd(), "content", kind);
}

export interface MarkdownFile {
  slug: string;
  data: Record<string, unknown>;
  content: string;
}

/**
 * Read every .md file in a content kind. A missing directory yields [] (the
 * callers render empty states, never a build failure).
 */
export function readMarkdownDir(kind: string): MarkdownFile[] {
  let files: string[];
  try {
    files = readdirSync(contentDir(kind)).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
  return files.map((file) => {
    const { data, content } = matter(
      readFileSync(path.join(contentDir(kind), file), "utf8"),
    );
    return { slug: file.replace(/\.md$/, ""), data, content };
  });
}

/**
 * Read one named markdown file (no extension). null on a missing/unreadable
 * file — callers decide what that means (fail closed, empty state, …).
 */
export function readMarkdownFile(kind: string, name: string): MarkdownFile | null {
  try {
    const { data, content } = matter(
      readFileSync(path.join(contentDir(kind), `${name}.md`), "utf8"),
    );
    return { slug: name, data, content };
  } catch {
    return null;
  }
}
