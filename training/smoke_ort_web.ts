/**
 * Quick de-risk: do the quantized candidates load and run under the
 * ORT-web wasm backend (the browser runtime), not just Python ORT?
 * Usage: npx tsx training/smoke_ort_web.ts export/easy
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import * as ort from "onnxruntime-web/wasm";

ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const dir = resolve(process.argv[2] ?? "export/easy");
async function main(): Promise<void> {
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".onnx"))) {
    try {
      const session = await ort.InferenceSession.create(
        new Uint8Array(readFileSync(join(dir, name))),
        { executionProviders: ["wasm"] },
      );
      const out = await session.run({
        board: new ort.Tensor("float32", new Float32Array(17 * 64), [
          1, 17, 8, 8,
        ]),
      });
      const logits = out.policy.data as Float32Array;
      let finite = true;
      for (let i = 0; i < logits.length; i++) {
        if (!Number.isFinite(logits[i])) {
          finite = false;
          break;
        }
      }
      console.log(
        `${name}: OK shape=${JSON.stringify(out.policy.dims)} finite=${finite}`,
      );
    } catch (err) {
      console.error(`${name}: FAILED ${String(err)}`);
      process.exitCode = 1;
    }
  }
}
void main();