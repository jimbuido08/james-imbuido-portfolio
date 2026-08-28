// JTB embedding endpoint — the only embeddings host reachable from Vercel.
//
// POST { inputs: string[] } → { embeddings: number[][] }  (L2-normalized, 384
// dims, model gte-small via supabase.ai). lib/jtb/embeddings.ts is the only
// intended caller (JTB turns carry the user's access token; `npm run kb:sync`
// carries the service key). No other secrets involved — the model runs inside
// Supabase, so OLLAMA_API_KEY never travels this path.
//
// Auth model: verify_jwt (project setting) validates the JWT signature and
// expiry at the gateway; THIS function additionally checks the role claim, so
// an anon/publishable key — a valid JWT, but role=anon — cannot burn inference
// quota. No anon access at all.

const MAX_TOTAL_CHARS = 100_000;
const MODEL_NAME = "gte-small";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface JwtPayload {
  role?: unknown;
}

/** Decode a JWT's payload segment without verifying it — the gateway already
 *  did (verify_jwt); here we only need the role claim to refuse anon keys. */
function payloadRole(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as JwtPayload;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const [scheme, jwt] = authHeader.split(" ");
  if (scheme !== "Bearer" || !jwt) {
    return Response.json(
      { error: "Missing bearer token" },
      { status: 401, headers: corsHeaders },
    );
  }
  const role = payloadRole(jwt);
  if (role !== "authenticated" && role !== "service_role") {
    return Response.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders },
    );
  }

  let body: { inputs?: unknown };
  try {
    body = (await req.json()) as { inputs?: unknown };
  } catch {
    return Response.json(
      { error: "Body must be valid JSON" },
      { status: 400, headers: corsHeaders },
    );
  }
  const inputs = body.inputs;
  if (
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    inputs.some((input) => typeof input !== "string" || input.length === 0)
  ) {
    return Response.json(
      { error: "inputs must be a non-empty array of non-empty strings" },
      { status: 400, headers: corsHeaders },
    );
  }
  const totalChars = inputs.reduce((sum, input) => sum + input.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return Response.json(
      {
        error: `Payload too large (${totalChars} chars, max ${MAX_TOTAL_CHARS})`,
      },
      { status: 413, headers: corsHeaders },
    );
  }

  const model = new Supabase.ai.Session(MODEL_NAME);
  // Sequential on purpose: each call is a separate forward pass and the
  // session is not concurrent-safe; 12 chunks × ~50ms is nowhere near a
  // latency concern for a 500K/month free-tier budget.
  const embeddings: number[][] = [];
  try {
    for (const input of inputs) {
      const embedding = (await model.run(input, {
        mean_pool: true,
        normalize: true,
      })) as number[];
      embeddings.push(embedding);
    }
  } catch (error) {
    console.error("jtb-embed: inference failed:", error);
    return Response.json(
      { error: "Embedding inference failed" },
      { status: 502, headers: corsHeaders },
    );
  }

  return Response.json({ embeddings }, { headers: corsHeaders });
});
