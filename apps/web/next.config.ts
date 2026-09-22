import type { NextConfig } from "next";
import { LOCAL_MCP_PACKAGES } from "./src/lib/isomorphic/localMcpPackages";

// Local (stdio) MCP servers run their npm package inside a worker thread that
// dynamically imports the real package from node_modules (see
// lib/server/upstream/workerThreadMcpServer.ts). Two build concerns follow:
//   1. The package must NOT be bundled by webpack — the worker resolves it by
//      name at runtime — so keep each one server-external.
//   2. The package's files must be traced into the standalone/serverless output
//      so they exist at runtime; webpack can't see the dynamic import, so we
//      include them explicitly for every route.
const localMcpPackageNames = LOCAL_MCP_PACKAGES.map((p) => p.package);

const nextConfig: NextConfig = {
  output: "standalone",
  // No next/image is used; skip the optimizer so `sharp` is not bundled.
  images: { unoptimized: true },
  serverExternalPackages: [...localMcpPackageNames],
  outputFileTracingIncludes: {
    "/**": localMcpPackageNames.map((name) => `./node_modules/${name}/**/*`),
  },
};

export default nextConfig;
