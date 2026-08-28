/**
 * kb:sync — index content/jtb/ into the jtb_chunks pgvector table on the
 * hosted Supabase project (§7 retrieval). Runs on James's machine only:
 *
 *   npm run kb:sync              # embed new/changed sections and upsert
 *   npm run kb:sync -- --check   # drift report only; exit 1 when out of date
 *
 * It is the ONLY thing allowed to hold the service-role key — it must never be
 * set in Vercel and never imported from app/ or lib/ (master plan §21). The
 * Supabase client here is built inside this script for exactly that reason;
 * the same key also authorizes the jtb-embed edge function (role=service_role).
 *
 * Embeddings come from the jtb-embed Supabase Edge Function
 * (lib/jtb/embeddings.ts, supabase.ai gte-small) — the same host the request
 * path uses, so dev and production indexes agree by construction. Sections
 * are chunked by lib/jtb/chunking.ts (gte-small truncates at 512 tokens);
 * the drift unit stays the WHOLE section (content_hash), so a section edit
 * re-embeds all of its chunks. After editing content/jtb/, run
 * `npm run kb:sync` so the index matches the markdown; `--check` exits
 * non-zero when it doesn't. The prompt is always rebuilt from the loader
 * (never from stored chunks), so stale rows degrade retrieval, never content.
 *
 * Relative imports only: this script runs outside Next.js via `npx tsx`.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

import { chunkSection } from "../lib/jtb/chunking";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIM } from "../lib/jtb/constants";
import { embedTexts } from "../lib/jtb/embeddings";
import {
  JTB_KB_FILES,
  loadKnowledgeBaseSections,
} from "../lib/jtb/knowledge-base";

interface ExistingRow {
  content_hash: string;
  embedding_model: string;
}

export interface SyncPlan {
  toAdd: string[];
  toUpdate: string[];
  toRemove: string[];
  unchanged: string[];
}

/**
 * Pure diff between the desired index (content on disk, hashed) and the
 * stored one. A stored row whose embedding_model differs from the configured
 * model is always an update — its vectors are meaningless for the new model.
 */
export function planSync(
  desired: ReadonlyMap<string, string>,
  existing: ReadonlyMap<string, ExistingRow>,
  embeddingModel: string,
): SyncPlan {
  const plan: SyncPlan = {
    toAdd: [],
    toUpdate: [],
    toRemove: [],
    unchanged: [],
  };
  for (const [section, hash] of desired) {
    const row = existing.get(section);
    if (!row) {
      plan.toAdd.push(section);
    } else if (
      row.embedding_model !== embeddingModel ||
      row.content_hash !== hash
    ) {
      plan.toUpdate.push(section);
    } else {
      plan.unchanged.push(section);
    }
  }
  for (const section of existing.keys()) {
    if (!desired.has(section)) plan.toRemove.push(section);
  }
  return plan;
}

/** Service-role client — script-only, never import this file from app/lib. */
function serviceClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "kb:sync needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and\n" +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local. The service key is in the\n" +
        "Supabase dashboard → Settings → API. Never set it in Vercel.",
    );
    process.exit(1);
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const embeddingModel = DEFAULT_EMBEDDING_MODEL;

  const sections = loadKnowledgeBaseSections();
  if (!sections) {
    console.error(
      "Knowledge base unavailable — a content/jtb/ file is missing or every\n" +
        "line of one is a placeholder. Fix content/ before syncing.",
    );
    process.exit(1);
  }
  const skipped = JTB_KB_FILES.filter(
    (file) => !sections.some((section) => section.section === file),
  );

  // Desired state: hash of exactly the text that reaches the prompt, so any
  // content edit (or a loader/placeholder-rule change) is drift.
  const desired = new Map<string, string>(
    sections.map((section) => [
      section.section,
      createHash("sha256").update(section.content).digest("hex"),
    ]),
  );

  const supabase = serviceClient();
  const { data: rows, error } = await supabase
    .from("jtb_chunks")
    .select("section, content_hash, embedding_model");
  if (error) {
    console.error("Could not read jtb_chunks:", error.message);
    process.exit(1);
  }
  // One row per (section, chunk); keep the first per section — the drift unit
  // is the whole section, so any per-section sample decides its fate.
  const existing = new Map<string, ExistingRow>();
  for (const row of rows ?? []) {
    if (!existing.has(row.section)) {
      existing.set(row.section, {
        content_hash: row.content_hash,
        embedding_model: row.embedding_model,
      });
    }
  }

  const plan = planSync(desired, existing, embeddingModel);
  const needed =
    plan.toAdd.length + plan.toUpdate.length + plan.toRemove.length;

  console.log(`Model: ${embeddingModel} · expected dims: ${EMBEDDING_DIM}`);
  console.log(
    `Live sections: ${sections.map((s) => s.section).join(", ")}` +
      (skipped.length
        ? `\nPlaceholder-skipped (James must fill these): ${skipped.join(", ")}`
        : ""),
  );
  console.log(
    `Unchanged: ${plan.unchanged.length} · add: ${plan.toAdd.join(", ") || "—"} · ` +
      `update: ${plan.toUpdate.join(", ") || "—"} · remove: ${plan.toRemove.join(", ") || "—"}`,
  );
  if (existing.size > 0) {
    const staleModels = [
      ...new Set(
        (rows ?? [])
          .map((row) => row.embedding_model)
          .filter((m) => m !== embeddingModel),
      ),
    ];
    for (const stale of staleModels) {
      console.log(`Model changed: ${stale} → ${embeddingModel}`);
    }
  }

  if (checkOnly) {
    if (needed > 0) {
      console.error(
        `\nIndex is out of date (${needed} change(s)) — run \`npm run kb:sync\`.`,
      );
      process.exit(1);
    }
    console.log("\nIndex is up to date.");
    process.exit(0);
  }

  if (needed === 0) {
    console.log("\nNothing to do — index already matches content.");
    process.exit(0);
  }

  if (existing.size === 0 && plan.toAdd.length > 0) {
    console.log(`\nFirst sync: embedding ${plan.toAdd.length} sections.`);
  }

  // Chunk every changed section, then embed ALL chunks in one embedTexts
  // batch (it sub-requests in batches the edge function's CPU budget can
  // survive). embedTexts throws on any transport/validation failure — a
  // failed sync writes nothing.
  const changed = sections.filter(
    (section) =>
      plan.toAdd.includes(section.section) ||
      plan.toUpdate.includes(section.section),
  );
  const chunked = changed.map((section) => ({
    section: section.section,
    contentHash: desired.get(section.section) ?? "",
    chunks: chunkSection(section.section, section.content),
  }));
  const allChunks = chunked.flatMap((c) => c.chunks);
  console.log(
    `Embedding ${allChunks.length} chunk(s) across ${changed.length} section(s)...`,
  );
  let vectors: number[][];
  try {
    vectors = await embedTexts({
      inputs: allChunks,
      authToken: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      // Generous per-request budget: edge-function inference is CPU-killed
      // well below this, so a hit means the function is unreachable. Unlike
      // the request path there is no reply to degrade — the sync just waits.
      timeoutMs: 30_000,
    });
  } catch (error) {
    console.error(
      "Embedding failed — nothing was written. Is the jtb-embed edge",
      "function deployed and reachable?",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  if (vectors.length !== allChunks.length) {
    console.error(
      `jtb-embed returned ${vectors.length} vectors for ${allChunks.length} chunks — aborting, nothing written.`,
    );
    process.exit(1);
  }
  for (let i = 0; i < vectors.length; i++) {
    if (vectors[i].length !== EMBEDDING_DIM) {
      console.error(
        `jtb-embed returned ${vectors[i].length} dims for chunk ${i} but the schema expects ${EMBEDDING_DIM} (EMBEDDING_DIM in lib/jtb/constants.ts) — aborting, nothing written. If you switched embedding models, the table needs a new migration.`,
      );
      process.exit(1);
    }
  }

  // Replace each changed/removed section's chunk rows wholesale: delete
  // first, then insert (no upsert — a section's chunk count can shrink, and
  // stale higher chunk_index rows would linger under the composite PK).
  const rewritten = [...plan.toUpdate, ...plan.toAdd, ...plan.toRemove];
  const { error: deleteError } = await supabase
    .from("jtb_chunks")
    .delete()
    .in("section", rewritten);
  if (deleteError) {
    console.error("Delete of stale chunks failed:", deleteError.message);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const inserts: Database["public"]["Tables"]["jtb_chunks"]["Insert"][] = [];
  let chunkIndex = 0;
  for (const c of chunked) {
    c.chunks.forEach((chunk, index) => {
      inserts.push({
        section: c.section,
        chunk_index: index,
        content: chunk,
        content_hash: c.contentHash,
        // PostgREST takes a pgvector column as a JSON array; the generated
        // types type it as string — cast contained here, this script being
        // the only writer (same seam treatment as deduct_credit's
        // typed-number NULL).
        embedding: vectors[chunkIndex++] as unknown as string,
        embedding_model: embeddingModel,
        updated_at: now,
      });
    });
  }
  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("jtb_chunks")
      .insert(inserts);
    if (insertError) {
      console.error("Chunk insert failed:", insertError.message);
      process.exit(1);
    }
  }

  console.log(
    `\nSynced: ${allChunks.length} chunk(s) across ${changed.length} section(s) embedded, ${plan.toRemove.length} section(s) removed.`,
  );
}

// Run only when executed directly (`npm run kb:sync`), so the pure diff logic
// stays importable for verification harnesses without tripping the env check.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
