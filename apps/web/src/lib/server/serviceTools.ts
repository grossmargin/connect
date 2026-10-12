import "server-only";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceConnection } from "@prisma/client";
import { audit } from "@/lib/server/audit";
import { principalActor, type Principal } from "@/lib/server/mcp";
import { errorResult, text } from "@/lib/server/mcpToolShared";
import { readServiceConfig } from "@/lib/server/serviceConnections";
import { getNangoCredentials, listNangoConnections } from "@/lib/server/serviceNango";
import type { NangoServiceConfig } from "@/lib/isomorphic/serviceConnectionTypes";

// Tools over a bundle's Nango service connections. One flat list across all of
// them; a connection is addressed as "<serviceSlug>:<providerConfigKey>:<nangoConnectionId>".

export const NANGO_TOOLS: Tool[] = [
  {
    name: "nango_list_connections",
    description:
      "List the connected accounts (Nango connections) you can pull credentials for: connection_id and description.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "nango_get_credentials",
    description:
      "Get live credentials for one connection: `credentials` (e.g. access_token, api_key) and `connection_config` " +
      "(e.g. QuickBooks realmId). OAuth tokens are refreshed and ready to use. This access is audited.",
    inputSchema: {
      type: "object",
      properties: { connection_id: { type: "string", description: "connection_id from nango_list_connections." } },
      required: ["connection_id"],
    },
  },
];
export const NANGO_TOOL_NAMES = new Set(NANGO_TOOLS.map((t) => t.name));

export function nangoConnectionKey(slug: string, providerConfigKey: string, connectionId: string): string {
  return `${slug}:${providerConfigKey}:${connectionId}`;
}

// Splits on the first two ":". Nango connection ids may contain ":".
export function parseNangoConnectionKey(
  key: unknown,
): { slug: string; providerConfigKey: string; connectionId: string } | null {
  if (typeof key !== "string") return null;
  const a = key.indexOf(":");
  const b = a < 0 ? -1 : key.indexOf(":", a + 1);
  if (a <= 0 || b <= a + 1 || b === key.length - 1) return null;
  return { slug: key.slice(0, a), providerConfigKey: key.slice(a + 1, b), connectionId: key.slice(b + 1) };
}

function json(data: unknown): CallToolResult {
  return text(JSON.stringify(data, null, 2));
}

async function listConnections(conns: ServiceConnection[]): Promise<CallToolResult> {
  const results = await Promise.all(
    conns.map(async (sc) => {
      try {
        const list = await listNangoConnections(readServiceConfig<NangoServiceConfig>(sc));
        return {
          connections: list.map((c) => {
            const endUser = c.end_user?.display_name || c.end_user?.email;
            return {
              connection_id: nangoConnectionKey(sc.slug, c.provider_config_key, c.connection_id),
              description: [c.provider_config_key, sc.name, endUser].filter(Boolean).join(" · "),
            };
          }),
        };
      } catch (e) {
        return { connections: [], error: { service: sc.name, error: e instanceof Error ? e.message : String(e) } };
      }
    }),
  );
  const errors = results.flatMap((r) => (r.error ? [r.error] : []));
  return json({ connections: results.flatMap((r) => r.connections), ...(errors.length ? { errors } : {}) });
}

export async function runNangoTool(
  conns: ServiceConnection[],
  name: string,
  args: Record<string, unknown>,
  ctx: { principal: Principal; ip?: string | null; userAgent?: string | null },
): Promise<CallToolResult> {
  const nango = conns.filter((c) => c.type === "nango");
  if (name === "nango_list_connections") return listConnections(nango);

  const key = parseNangoConnectionKey(args.connection_id);
  if (!key) return errorResult("connection_id is required. Get one from nango_list_connections.");
  const sc = nango.find((c) => c.slug === key.slug);
  if (!sc) return errorResult(`Unknown connection_id "${String(args.connection_id)}".`);

  const creds = await getNangoCredentials(readServiceConfig<NangoServiceConfig>(sc), key.connectionId, key.providerConfigKey);
  await audit({
    ...principalActor(ctx.principal),
    action: "VIEW_SERVICE_CREDENTIAL",
    source: "MCP",
    teamId: sc.teamId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { serviceConnectionId: sc.id, providerConfigKey: key.providerConfigKey, connectionId: key.connectionId },
  });
  return json(creds);
}
