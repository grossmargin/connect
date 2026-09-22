import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fetchToolDefs, callUpstreamTool, type AuthHeaders } from "@/lib/server/mcpClient";
import type { UpstreamMcpServer, ToolListing } from "./types";

// A remote MCP server reached over Streamable HTTP. Auth is a resolved set of
// HTTP headers (an OAuth bearer for DCR, or the static header map for HEADERS) —
// see resolveAuthHeaders / memberHeaders, which handle any token refresh before
// the server is opened. Each call opens and closes its own client.
export class RemoteMcpServer implements UpstreamMcpServer {
  constructor(
    readonly label: string,
    private readonly url: string,
    private readonly headers: AuthHeaders,
  ) {}

  listTools(): Promise<ToolListing> {
    return fetchToolDefs(this.url, this.headers);
  }

  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return callUpstreamTool(this.url, this.headers, name, args);
  }
}
