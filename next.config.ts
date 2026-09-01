import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the JTB knowledge base markdown into the serverless bundle so
  // /api/jtb can read it at runtime via node:fs (lib/jtb/knowledge-base.ts).
  outputFileTracingIncludes: {
    "/api/jtb": ["./content/jtb/**/*.md"],
  },
  async headers() {
    return [
      {
        // Chess model artifacts + the self-hosted ORT wasm runtime: immutable
        // in practice (versioned by the repo), fetched at most once per day
        // per client, revalidated in the background after a week.
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
