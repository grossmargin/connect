import "server-only";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection, McpGroup } from "@prisma/client";
import { fetchToolDefs, callUpstreamTool } from "@/lib/server/mcpClient";
import { text, errorResult, memberHeaders } from "@/lib/server/mcpToolShared";

// A Published MCP exposes two kinds of member:
//   - individual connection: its tools are published under "<conn.slug>__",
//     called directly (no tenant argument).
//   - group: several connections (tenants) sharing one tool namespace
//     "<group.slug>__", routed by a required `tenant` argument.

export type GroupWithTenants = McpGroup & { tenants: McpConnection[] };

// ---------- individual member connection ----------

export const connPrefix = (c: McpConnection) => `${c.slug}__`;
const connInstructionsName = (c: McpConnection) => `${connPrefix(c)}instructions`;

export function connOwns(c: McpConnection, name: string): boolean {
  return name.startsWith(connPrefix(c));
}

// Tool defs an individual connection contributes: its upstream tools
// (slug-prefixed) plus an instructions helper.
export async function connToolDefs(c: McpConnection): Promise<Tool[]> {
  let upstream: Tool[] = [];
  try {
    upstream = (await fetchToolDefs(c.url, await memberHeaders(c))).tools;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`connToolDefs: upstream tools unavailable for "${c.name}": ${reason}`);
  }
  const prefixed: Tool[] = upstream.map((t) => ({ ...t, name: `${connPrefix(c)}${t.name}` }));
  return [
    ...prefixed,
    {
      name: connInstructionsName(c),
      description: `Get the MCP instructions for "${c.name}".`,
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

export type ConnCallOutcome = { result: CallToolResult; connectionId: string };

export async function handleConnCall(
  c: McpConnection,
  name: string,
  args: Record<string, unknown>,
): Promise<ConnCallOutcome> {
  if (name === connInstructionsName(c)) {
    const { instructions } = await fetchToolDefs(c.url, await memberHeaders(c));
    return { result: text(instructions ?? "(no instructions)"), connectionId: c.id };
  }
  const original = name.slice(connPrefix(c).length);
  const result = await callUpstreamTool(c.url, await memberHeaders(c), original, args);
  return { result, connectionId: c.id };
}

// ---------- tenanted group ----------

export const groupPrefix = (g: McpGroup) => `${g.slug}__`;
const tenantsName = (g: McpGroup) => `${groupPrefix(g)}tenants`;
const groupInstructionsName = (g: McpGroup) => `${groupPrefix(g)}instructions`;

export function groupOwns(g: McpGroup, name: string): boolean {
  return name.startsWith(groupPrefix(g));
}

// Tool defs a group contributes: its tenants' shared tools (slug-prefixed, each
// taking a required `tenant` argument) plus two helper tools. Tools come from
// the first tenant.
export async function groupToolDefs(g: GroupWithTenants): Promise<Tool[]> {
  const ref = g.tenants[0];
  let upstream: Tool[] = [];
  if (ref) {
    try {
      upstream = (await fetchToolDefs(ref.url, await memberHeaders(ref))).tools;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`groupToolDefs: upstream tools unavailable for "${ref.name}": ${reason}`);
    }
  }
  const tenantArg = {
    type: "string",
    description: `Tenant id selecting which account to call (get ids from ${tenantsName(g)}).`,
  } as const;
  const prefixed: Tool[] = upstream.map((t) => ({
    ...t,
    name: `${groupPrefix(g)}${t.name}`,
    inputSchema: {
      ...t.inputSchema,
      properties: { ...(t.inputSchema?.properties ?? {}), tenant: tenantArg },
      required: [...(t.inputSchema?.required ?? []), "tenant"],
    },
  }));
  return [
    ...prefixed,
    {
      name: tenantsName(g),
      description: `List the tenants (id + name) in the "${g.name}" group.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: groupInstructionsName(g),
      description: `Get the MCP instructions for one tenant of the "${g.name}" group.`,
      inputSchema: {
        type: "object",
        properties: { tenant: { type: "string", description: "Tenant id (from the *_tenants tool)." } },
        required: ["tenant"],
      },
    },
  ];
}

export type GroupCallOutcome = { result: CallToolResult; connectionId?: string; tenant?: string };

// Dispatches one slug-prefixed call for a group. Shared tools route by `tenant`.
export async function handleGroupCall(
  g: GroupWithTenants,
  name: string,
  args: Record<string, unknown>,
): Promise<GroupCallOutcome> {
  const bySlug = new Map(g.tenants.map((c) => [c.slug, c]));

  if (name === tenantsName(g)) {
    return {
      result: text(JSON.stringify(g.tenants.map((c) => ({ id: c.slug, name: c.name })), null, 2)),
    };
  }

  if (name === groupInstructionsName(g)) {
    const t = String(args.tenant ?? "");
    const conn = bySlug.get(t);
    if (!conn) return { result: errorResult(`Unknown tenant "${t}". Call ${tenantsName(g)} to list them.`) };
    const { instructions } = await fetchToolDefs(conn.url, await memberHeaders(conn));
    return { result: text(instructions ?? "(no instructions)"), connectionId: conn.id, tenant: t };
  }

  const original = name.slice(groupPrefix(g).length);
  const { tenant: tenantArg, ...upstreamArgs } = args;
  const tenant = typeof tenantArg === "string" ? tenantArg : "";
  if (!tenant) {
    return {
      result: errorResult(
        `Missing "tenant" argument. Call ${tenantsName(g)} to list tenant ids, then pass one as "tenant".`,
      ),
    };
  }
  const conn = bySlug.get(tenant);
  if (!conn) {
    return { result: errorResult(`Unknown tenant "${tenant}". Call ${tenantsName(g)} to list them.`), tenant };
  }
  const result = await callUpstreamTool(conn.url, await memberHeaders(conn), original, upstreamArgs);
  return { result, connectionId: conn.id, tenant };
}
