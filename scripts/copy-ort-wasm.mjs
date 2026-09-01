/**
 * Copy the onnxruntime-web wasm runtime into public/models/ort/ so the site
 * self-hosts the ORT backend (the fallback path must not depend on a
 * third-party CDN). Run once after installing/upgrading onnxruntime-web and
 * commit the output.
 *
 * Only the two files the wasm-only backend needs are copied
 * (ort-wasm-simd-threaded.{mjs,wasm} — numThreads=1, no jsep/webgpu).
 */
import { cpSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
// Resolving the wasm entry (not package.json — not exported) lands in dist/.
const distDir = dirname(require.resolve("onnxruntime-web/wasm"));

const outDir = resolve(process.cwd(), "public/models/ort");
mkdirSync(outDir, { recursive: true });

const files = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
for (const file of files) {
  const src = join(distDir, file);
  try {
    cpSync(src, join(outDir, file));
  } catch {
    console.error(`missing expected ORT runtime file: ${src}`);
    process.exit(1);
  }
  const size = statSync(join(outDir, file)).size;
  console.log(`copied ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log("ORT wasm runtime self-hosted in public/models/ort/");
