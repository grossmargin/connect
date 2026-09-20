import "server-only";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolvePrincipal, type Principal } from "@/lib/mcp";
import { logMcpCall } from "@/lib/mcpLog";
import {
  toolsetToolDefs,
  handleToolsetCall,
  type ToolsetWithConnections,
} from "@/lib/toolsetTools";

function principalFrom(extra: { authInfo?: AuthInfo }): Principal {
  const p = extra.authInfo?.extra?.principal as Principal | undefined;
  if (!p) throw new Error("unauthenticated");
  return p;
}

// Verifies the bearer AND that the principal can access this toolset's team.
function verifyForTeam(teamId: string) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    if (!bearer) return undefined;
    const p = await resolvePrincipal(bearer);
    if (!p || !p.teamIds.includes(teamId)) return undefined;
    return {
      token: bearer,
      clientId: p.kind === "sa" ? p.serviceAccountId : p.userId,
      scopes: ["credentials:read"],
      extra: { principal: p },
    };
  };
}

// One toolset served as its own MCP endpoint at /toolset/<id>.
export function buildToolsetHandler(toolset: ToolsetWithConnections) {
  const handler = createMcpHandler(
    (mcp) => {
      const server = mcp.server;

      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: await toolsetToolDefs(toolset),
      }));

      server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
        const name = req.params.name;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;
        const principal = principalFrom(extra);
        const started = Date.now();
        try {
          const out = await handleToolsetCall(toolset, name, args);
          await logMcpCall(principal, {
            source: "toolset",
            teamId: toolset.teamId,
            toolsetId: toolset.id,
            connectionId: out.connectionId,
            tenant: out.tenant,
            toolName: name,
            args,
            ok: !out.result.isError,
            durationMs: Date.now() - started,
          });
          return out.result;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "call failed";
          await logMcpCall(principal, {
            source: "toolset",
            teamId: toolset.teamId,
            toolsetId: toolset.id,
            tenant: typeof args.tenant === "string" ? args.tenant : null,
            toolName: name,
            args,
            ok: false,
            error: msg,
            durationMs: Date.now() - started,
          });
          return { content: [{ type: "text", text: msg }], isError: true };
        }
      });
    },
    {
      capabilities: { tools: {} },
      instructions:
        `Aggregates ${toolset.connections.length} MCP server(s). ` +
        `Call ${toolset.slug}__tenants to list tenants, pass one as the "tenant" argument ` +
        `on every tool call, and call ${toolset.slug}__instructions for a tenant's own instructions.`,
    },
    { streamableHttpEndpoint: `/toolset/${toolset.id}` },
  );

  return withMcpAuth(handler, verifyForTeam(toolset.teamId), { required: true });
}
