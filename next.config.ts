import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the JTB knowledge base markdown into the serverless bundle so
  // /api/jtb can read it at runtime via node:fs (lib/jtb/knowledge-base.ts).
  outputFileTracingIncludes: {
    "/api/jtb": ["./content/jtb/**/*.md"],
  },
};

export default nextConfig;
