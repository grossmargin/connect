import "server-only";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolListing = { tools: Tool[]; instructions?: string };

// The common interface over an upstream MCP server, regardless of how we reach
// it. Two implementations exist:
//   - RemoteMcpServer       — a remote server over Streamable HTTP (DCR/HEADERS).
//   - WorkerThreadMcpServer — a local Node stdio server run in a worker thread.
// Both are stateless configuration handles: each call opens its own transport,
// performs the one operation, and tears it down. There is no persistent
// connection (and, for the worker, no persistent thread) to close, so callers
// need no lifecycle management.
export interface UpstreamMcpServer {
  // A human label for error messages / logs (e.g. the connection name).
  readonly label: string;
  listTools(): Promise<ToolListing>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}
