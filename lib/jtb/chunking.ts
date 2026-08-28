/**
 * Deterministic section → chunk splitter for the JTB retrieval index.
 *
 * gte-small (the edge-function embedding model) silently truncates at 512
 * tokens, and whole sections overflow that (experience.md ≈ 1.5k tokens), so
 * sections are split at their `### ` subsection boundaries and packed into
 * chunks ≤ MAX_CHUNK_CHARS (~400 gte-small tokens; the 512 limit with ~25%
 * margin). Each chunk is prefixed with a plain-English description of its
 * section — calibrated 2026-08-28 (.verify-gte-prefix.mts): the prefix lifts
 * the on-topic/off-topic gap from 0.059 to 0.074 and top-4 section precision
 * from 14/16 to 16/16 (education questions were outranked by career.md
 * without it). Chunks are a storage detail only: scores are max-pooled back
 * to section level in lib/jtb/retrieval.ts and the prompt always receives
 * whole sections from lib/jtb/knowledge-base.ts — a chunk's text never
 * reaches a prompt, so this file cannot leak framing inconsistencies into §7
 * grounding.
 *
 * Pure and deterministic: the same section text always yields the same chunks
 * (asserted by the kb:sync harness).
 */

/** Char budget per chunk — ~400 gte-small tokens (512-token limit, ~25% margin). */
export const MAX_CHUNK_CHARS = 1600;

/**
 * Plain-English section descriptor prepended to every chunk before embedding
 * and storage. gte-small has a high similarity baseline (any two English
 * texts score ~0.7+), and a generic question ("What education does James
 * have?") otherwise fails to outrank career-adjacent sections. Never shown to
 * a visitor or the model — chunks are index material only.
 */
const SECTION_PREFIXES: Record<string, string> = {
  about: "background",
  ai: "AI and generative AI work",
  ml: "machine learning work",
  career: "career path",
  faq: "frequently asked questions",
};

function sectionPrefix(section: string): string {
  const topic = SECTION_PREFIXES[section] ?? section;
  return `Information about James Imbuido's ${topic}.`;
}

/**
 * Split a section's body into `### `-headed subsections (each keeps its
 * heading — the strongest retrieval signal a chunk carries). Text before the
 * first heading, if any, is its own subsection. Subsections stay in file order.
 */
function splitSubsections(content: string): string[] {
  const subsections: string[] = [];
  let current: string[] = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("### ") && current.length > 0) {
      subsections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) subsections.push(current.join("\n").trim());
  return subsections.filter((sub) => sub.length > 0);
}

/**
 * Split one subsection into pieces that each fit `budget`: prefer keeping it
 * whole; otherwise pack `\n\n` paragraphs; a single paragraph still over
 * budget is hard-split at a char boundary (last resort — no silently
 * truncated text ever enters the index, unlike a model-side truncation).
 */
function splitToBudget(text: string, budget: number): string[] {
  if (text.length <= budget) return [text];

  const paragraphs = text.split("\n\n");
  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    if (current) pieces.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    // A paragraph alone over budget → hard-split at the boundary.
    if (paragraph.length > budget) {
      flush();
      for (let i = 0; i < paragraph.length; i += budget) {
        pieces.push(paragraph.slice(i, i + budget));
      }
      continue;
    }
    if (current && current.length + 2 + paragraph.length > budget) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return pieces;
}

/**
 * Chunk one section body (placeholder-stripped, as loaded from the KB).
 * Subsections are packed greedily in file order and joined with a blank line,
 * matching the source layout; every chunk carries the section prefix line and
 * stays within MAX_CHUNK_CHARS including it.
 */
export function chunkSection(section: string, content: string): string[] {
  const prefix = sectionPrefix(section);
  const budget = MAX_CHUNK_CHARS - prefix.length - 1;

  const packed: string[] = [];
  let current = "";
  for (const subsection of splitSubsections(content)) {
    for (const piece of splitToBudget(subsection, budget)) {
      if (current && current.length + 2 + piece.length > budget) {
        packed.push(current);
        current = piece;
      } else {
        current = current ? `${current}\n\n${piece}` : piece;
      }
    }
  }
  if (current) packed.push(current);

  return packed.map((chunk) => `${prefix}\n${chunk}`);
}
