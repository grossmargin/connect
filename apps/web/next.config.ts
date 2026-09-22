import type { NextConfig } from "next";
import { LOCAL_MCP_PACKAGES } from "./src/lib/isomorphic/localMcpPackages";

// Local (stdio) MCP servers run their npm package inside a worker thread that
// dynamically imports the real package from node_modules at runtime (see
// lib/server/upstream/workerThreadMcpServer.ts). Keep each allowlisted package
// server-external so webpack never tries to bundle it; the worker resolves it by
// name. The package's files (and their full dependency closure) are pulled into
// the standalone output by the build-time trace hint in
// workerThreadMcpServer.ts — do NOT add an outputFileTracingIncludes glob for
// these, as that produces a flattened node_modules copy without the dependency
// symlink farm, which then shadows the real one and breaks resolution.
const localMcpPackageNames = LOCAL_MCP_PACKAGES.map((p) => p.package);

const nextConfig: NextConfig = {
  output: "standalone",
  // No next/image is used; skip the optimizer so `sharp` is not bundled.
  images: { unoptimized: true },
  serverExternalPackages: [...localMcpPackageNames],
};

export default nextConfig;
