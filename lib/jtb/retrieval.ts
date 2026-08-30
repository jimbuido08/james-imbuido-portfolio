/**
 * JTB retrieval — the policy that narrows §7 grounding from the whole KB to
 * the most relevant sections. Deps are injected (embed client, RPC client, k,
 * threshold) so every branch is exercisable without live infra.
 *
 * Never throws: every { ok:false } means "degrade to the whole KB" (the exact
 * pre-RAG behaviour), so retrieval can only cost tokens, never the reply.
 * The threshold is applied HERE, not in SQL, so below-threshold scores stay
 * observable in chat_interactions telemetry.
 *
 * The index is chunk-level (lib/jtb/chunking.ts — gte-small truncates at 512
 * tokens) but retrieval stays SECTION-level: chunk scores are max-pooled back
 * to their section, and the returned `sections` are section slugs only — the
 * prompt text is rebuilt from the loader in lib/jtb/turn.ts, structurally
 * guaranteeing the framing invariant (stale index rows can never leak old
 * text into a prompt).
 *
 * Server-only in effect: deps are constructed with lib/jtb/embeddings.ts and
 * the server Supabase client in the route. Never import from client components.
 */

/** One retrieved chunk — mirrors the match_jtb_chunks RPC row shape. */
export interface JtbChunkMatch {
  section: string;
  chunk_index: number;
  content: string;
  similarity: number;
  embedding_model: string;
}

/**
 * Normalize raw match_jtb_chunks rows into JtbChunkMatch. types/supabase.ts
 * can't prove the row shape across the RPC seam (the deduct_credit lesson) —
 * shape-check every row and drop malformed ones rather than trust the cast.
 */
export function normalizeChunkMatchRows(data: unknown): JtbChunkMatch[] {
  const matches: JtbChunkMatch[] = [];
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  for (const row of rows as unknown[]) {
    const r = row as Record<string, unknown> | null;
    if (
      r &&
      typeof r.section === "string" &&
      typeof r.chunk_index === "number" &&
      typeof r.content === "string" &&
      typeof r.similarity === "number" &&
      typeof r.embedding_model === "string"
    ) {
      matches.push({
        section: r.section,
        chunk_index: r.chunk_index,
        content: r.content,
        similarity: r.similarity,
        embedding_model: r.embedding_model,
      });
    } else {
      console.error("[jtb] match_jtb_chunks: dropping malformed row");
    }
  }
  return matches;
}

export type JtbRetrievalFailureReason =
  | "embed_failed"
  | "rpc_failed"
  | "no_rows"
  | "below_threshold"
  | "model_mismatch";

export type JtbRetrieval =
  | { ok: true; sections: string[]; topSimilarity: number }
  | { ok: false; reason: JtbRetrievalFailureReason };

export interface JtbRetrievalDeps {
  embedTexts(params: { inputs: string[] }): Promise<number[][]>;
  matchChunks(params: {
    queryEmbedding: number[];
    matchCount: number;
  }): Promise<{ ok: true; matches: JtbChunkMatch[] } | { ok: false }>;
  model: string;
  /** How many chunks the RPC may return before pooling — must exceed topK
   *  (the top chunks can all belong to one section). */
  matchCount: number;
  topK: number;
  minSimilarity: number;
}

/**
 * Grounding for one message: embed it, take the top stored chunks, max-pool
 * their scores back to sections, and keep the top-k sections above the
 * threshold. Any failure — embed unreachable, RPC error, empty index, nothing
 * above threshold, or a stored vector from a different model — degrades to
 * the whole KB.
 */
export async function retrieveContext(
  deps: JtbRetrievalDeps,
  query: string,
): Promise<JtbRetrieval> {
  let vectors: number[][];
  try {
    vectors = await deps.embedTexts({ inputs: [query] });
  } catch (error) {
    console.error(
      "[jtb] retrieval: embed failed — falling back to whole KB:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "embed_failed" };
  }

  const queryEmbedding = vectors[0];
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.error(
      "[jtb] retrieval: empty embedding returned — falling back to whole KB",
    );
    return { ok: false, reason: "embed_failed" };
  }

  const rpc = await deps.matchChunks({
    queryEmbedding,
    matchCount: deps.matchCount,
  });
  if (!rpc.ok) {
    console.error(
      "[jtb] retrieval: match_jtb_chunks failed — falling back to whole KB",
    );
    return { ok: false, reason: "rpc_failed" };
  }

  if (rpc.matches.length === 0) {
    console.error(
      "[jtb] retrieval: no chunks stored — run `npm run kb:sync`; falling back to whole KB",
    );
    return { ok: false, reason: "no_rows" };
  }

  // The index was built by a different model than this query is embedded with
  // — the scores would be meaningless. Loud, because it means a kb:sync run
  // against the new model is overdue.
  const stale = rpc.matches.find(
    (match) => match.embedding_model !== deps.model,
  );
  if (stale) {
    console.error(
      `[jtb] retrieval: index model "${stale.embedding_model}" != query model "${deps.model}" — run \`npm run kb:sync\`; falling back to whole KB`,
    );
    return { ok: false, reason: "model_mismatch" };
  }

  // Max-pool chunk scores back to sections. The RPC returns globally
  // similarity-ordered rows, but the pooling tracks the true max per section
  // and re-sorts, so section ranking never depends on the RPC's ordering.
  const pooled: Array<{ section: string; similarity: number }> = [];
  const bySection = new Map<string, { section: string; similarity: number }>();
  for (const match of rpc.matches) {
    const entry = bySection.get(match.section);
    if (!entry) {
      const fresh = { section: match.section, similarity: match.similarity };
      bySection.set(match.section, fresh);
      pooled.push(fresh);
    } else if (match.similarity > entry.similarity) {
      entry.similarity = match.similarity;
    }
  }
  pooled.sort((a, b) => b.similarity - a.similarity);

  // Threshold on the pooled section scores, then cut to top-k sections.
  const above = pooled.filter((s) => s.similarity >= deps.minSimilarity);
  if (above.length === 0) {
    // Expected for off-topic questions — no log; telemetry shows it.
    return { ok: false, reason: "below_threshold" };
  }

  return {
    ok: true,
    sections: above.slice(0, deps.topK).map((s) => s.section),
    topSimilarity: above[0].similarity,
  };
}
