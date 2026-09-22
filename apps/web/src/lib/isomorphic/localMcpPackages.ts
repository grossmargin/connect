// Local (stdio) MCP servers we support: Node packages we host in-process by
// running their stdio server inside a short-lived worker thread (see
// lib/server/upstream/workerThreadMcpServer.ts). This is NOT open-ended — each
// entry is a vetted npm package that MUST also be a build-time dependency in
// apps/web/package.json AND kept as a server-external package in next.config so
// its files ship to the deployment. Running one executes that package's code in
// our process, so this list is a trust boundary: add only packages we've vetted
// and pinned.
//
// `env` documents the environment variables the server reads (e.g. an API key);
// they are shown as hints in the UI and stored encrypted per connection. It is
// advisory only — the user's env textarea is the source of truth.
export type LocalMcpPackage = {
  package: string;
  name: string;
  description?: string;
  env: { key: string; label: string; required?: boolean }[];
};

export const LOCAL_MCP_PACKAGES: LocalMcpPackage[] = [
  {
    package: "helius-mcp",
    name: "Helius (Solana)",
    description: "Solana data & wallet tools from Helius.",
    env: [{ key: "HELIUS_API_KEY", label: "Helius API key", required: true }],
  },
];

export function findLocalMcpPackage(pkg: string): LocalMcpPackage | undefined {
  return LOCAL_MCP_PACKAGES.find((p) => p.package === pkg);
}

export function isAllowedLocalMcpPackage(pkg: string): boolean {
  return LOCAL_MCP_PACKAGES.some((p) => p.package === pkg);
}

// A stdio connection has no server URL. We store a stable sentinel in the
// McpConnection.url column (which is non-null) so the package is readable
// without decrypting credentials — for listing, display, and build-time
// tracing. The env (a secret) lives in the encrypted credentials.
const STDIO_URL_PREFIX = "stdio:";

export function stdioSentinelUrl(pkg: string): string {
  return `${STDIO_URL_PREFIX}${pkg}`;
}

export function isStdioSentinelUrl(url: string): boolean {
  return url.startsWith(STDIO_URL_PREFIX);
}

export function packageFromSentinelUrl(url: string): string | null {
  return url.startsWith(STDIO_URL_PREFIX) ? url.slice(STDIO_URL_PREFIX.length) : null;
}
