import "server-only";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection, McpToolset } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readCredentials, packCredentials } from "@/lib/mcpCredentials";
import { resolveAuthHeaders, fetchToolDefs, callUpstreamTool, type AuthHeaders } from "@/lib/mcpClient";

export type ToolsetWithConnections = McpToolset & { connections: McpConnection[] };

export function text(s: string): CallToolResult {
  return { content: [{ type: "text", text: s }] };
}
export function errorResult(s: string): CallToolResult {
  return { content: [{ type: "text", text: s }], isError: true };
}

// Joins the text parts of a result — used to log the message an error result
// carried back to the caller.
export function resultText(result: CallToolResult): string {
  return (result.content ?? [])
    .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
    .join("\n");
}

export function headerValue(headers: Record<string, string | string[]> | undefined, name: string) {
  if (!headers) return undefined;
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

// Auth headers to reach one member, persisting an OAuth refresh if it happened.
export async function memberHeaders(conn: McpConnection): Promise<AuthHeaders> {
  const creds = readCredentials(conn.encryptedCredentials);
  if (!creds) throw new Error(`"${conn.name}" is not registered.`);
  const { headers, refreshedCreds } = await resolveAuthHeaders(conn, creds);
  if (refreshedCreds) {
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { encryptedCredentials: packCredentials(refreshedCreds) },
    });
  }
  return headers;
}

// Tools contributed by a toolset are prefixed with "<slug>__".
export const toolsetPrefix = (ts: McpToolset) => `${ts.slug}__`;
const tenantsName = (ts: McpToolset) => `${toolsetPrefix(ts)}tenants`;
const instructionsName = (ts: McpToolset) => `${toolsetPrefix(ts)}instructions`;

// A tool name belongs to this toolset when it carries its prefix.
export function toolsetOwns(ts: McpToolset, name: string): boolean {
  return name.startsWith(toolsetPrefix(ts));
}

// Tool defs a toolset contributes: its members' shared tools (slug-prefixed) plus
// the two helper tools. Tools/instructions come from the first member.
export async function toolsetToolDefs(ts: ToolsetWithConnections): Promise<Tool[]> {
  const ref = ts.connections[0];
  // Upstream may be unreachable/unauthorized; still expose the helper tools.
  let upstream: Tool[] = [];
  if (ref) {
    try {
      upstream = (await fetchToolDefs(ref.url, await memberHeaders(ref))).tools;
    } catch (e) {
      // Degrade gracefully so the helper tools stay listed, but never discard
      // the reason silently — a bad ENCRYPTION_KEY or auth failure must be
      // diagnosable, not invisible.
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`toolsetToolDefs: upstream tools unavailable for "${ref.name}": ${reason}`);
      upstream = [];
    }
  }
  // Every routed tool takes a required `tenant` argument selecting the account.
  const tenantArg = {
    type: "string",
    description: `Tenant id selecting which account to call (get ids from ${tenantsName(ts)}).`,
  } as const;
  const prefixed: Tool[] = upstream.map((t) => ({
    ...t,
    name: `${toolsetPrefix(ts)}${t.name}`,
    inputSchema: {
      ...t.inputSchema,
      properties: { ...(t.inputSchema?.properties ?? {}), tenant: tenantArg },
      required: [...(t.inputSchema?.required ?? []), "tenant"],
    },
  }));
  return [
    ...prefixed,
    {
      name: tenantsName(ts),
      description: `List the tenants (id + name) in the "${ts.name}" toolset.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: instructionsName(ts),
      description: `Get the MCP instructions for one tenant of the "${ts.name}" toolset.`,
      inputSchema: {
        type: "object",
        properties: { tenant: { type: "string", description: "Tenant id (from the *_tenants tool)." } },
        required: ["tenant"],
      },
    },
  ];
}

export type ToolsetCallOutcome = {
  result: CallToolResult;
  connectionId?: string;
  tenant?: string;
};

// Dispatches one slug-prefixed call for a toolset. Shared tools route by the
// `tenant` argument.
export async function handleToolsetCall(
  ts: ToolsetWithConnections,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolsetCallOutcome> {
  const bySlug = new Map(ts.connections.map((c) => [c.slug, c]));

  if (name === tenantsName(ts)) {
    return {
      result: text(
        JSON.stringify(ts.connections.map((c) => ({ id: c.slug, name: c.name })), null, 2),
      ),
    };
  }

  if (name === instructionsName(ts)) {
    const t = String(args.tenant ?? "");
    const conn = bySlug.get(t);
    if (!conn) return { result: errorResult(`Unknown tenant "${t}". Call ${tenantsName(ts)} to list them.`) };
    const { instructions } = await fetchToolDefs(conn.url, await memberHeaders(conn));
    return { result: text(instructions ?? "(no instructions)"), connectionId: conn.id, tenant: t };
  }

  // A shared upstream tool: strip the prefix and route by the `tenant` argument.
  const original = name.slice(toolsetPrefix(ts).length);
  const { tenant: tenantArg, ...upstreamArgs } = args;
  const tenant = typeof tenantArg === "string" ? tenantArg : "";
  if (!tenant) {
    return {
      result: errorResult(
        `Missing "tenant" argument. Call ${tenantsName(ts)} to list tenant ids, then pass one as "tenant".`,
      ),
    };
  }
  const conn = bySlug.get(tenant);
  if (!conn) {
    return {
      result: errorResult(`Unknown tenant "${tenant}". Call ${tenantsName(ts)} to list them.`),
      tenant,
    };
  }
  const result = await callUpstreamTool(conn.url, await memberHeaders(conn), original, upstreamArgs);
  return { result, connectionId: conn.id, tenant };
}
