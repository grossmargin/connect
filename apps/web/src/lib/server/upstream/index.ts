import "server-only";
import type { McpConnection } from "@prisma/client";
import type {
  CallToolResult,
  Resource,
  ReadResourceResult,
  Prompt,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import { readCredentials } from "@/lib/server/mcpCredentials";
import { memberHeaders } from "@/lib/server/mcpToolShared";
import type { ToolInfo } from "@/lib/server/mcpClient";
import { RemoteMcpServer } from "./remoteMcpServer";
import { WorkerThreadMcpServer } from "./workerThreadMcpServer";
import type { UpstreamMcpServer, ToolListing } from "./types";

export type { UpstreamMcpServer, ToolListing } from "./types";

// Resolves a connection into the right upstream implementation, doing any auth
// work needed up front (an OAuth refresh for DCR, persisted by memberHeaders).
// Branches on the authType column — no need to decrypt to choose the transport.
export async function openUpstream(conn: McpConnection): Promise<UpstreamMcpServer> {
  if (conn.authType === "STDIO") {
    const creds = readCredentials(conn.encryptedCredentials);
    if (!creds || creds.authType !== "STDIO") {
      throw new Error(`"${conn.name}" is not configured (no local MCP settings).`);
    }
    return new WorkerThreadMcpServer(conn.name, creds.package, creds.env);
  }
  // DCR / HEADERS — a remote server over Streamable HTTP.
  const headers = await memberHeaders(conn);
  return new RemoteMcpServer(conn.name, conn.url, headers);
}

// Full tool definitions (with inputSchema) plus instructions for a connection.
export async function listConnTools(conn: McpConnection): Promise<ToolListing> {
  return (await openUpstream(conn)).listTools();
}

// Calls one tool on a connection.
export async function callConnTool(
  conn: McpConnection,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await openUpstream(conn)).callTool(name, args);
}

export async function listConnResources(conn: McpConnection): Promise<Resource[]> {
  return (await openUpstream(conn)).listResources();
}

export async function readConnResource(conn: McpConnection, uri: string): Promise<ReadResourceResult> {
  return (await openUpstream(conn)).readResource(uri);
}

export async function listConnPrompts(conn: McpConnection): Promise<Prompt[]> {
  return (await openUpstream(conn)).listPrompts();
}

export async function getConnPrompt(
  conn: McpConnection,
  name: string,
  args: Record<string, string>,
): Promise<GetPromptResult> {
  return (await openUpstream(conn)).getPrompt(name, args);
}

// Lightweight probe (names + descriptions + instructions), used by Test and the
// status report.
export async function probeConn(conn: McpConnection): Promise<{ tools: ToolInfo[]; instructions?: string }> {
  const { tools, instructions } = await listConnTools(conn);
  return { tools: tools.map((t) => ({ name: t.name, description: t.description })), instructions };
}
