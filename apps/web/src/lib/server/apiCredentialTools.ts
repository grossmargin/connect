import "server-only";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceConnection } from "@prisma/client";
import { getCredentials, viewCredential, type Principal, type VaultFilter } from "@/lib/server/mcp";
import { errorResult, text } from "@/lib/server/mcpToolShared";
import { publicServiceConfig } from "@/lib/server/serviceConnections";
import { connectionState } from "@/lib/isomorphic/serviceConnectionTypes";
import { isUuid } from "@/lib/isomorphic/ids";
import { describeServiceConnection, serviceCredentials } from "@/lib/server/serviceTools";

// One flat list of everything an agent can use to call an API directly: vault
// credentials (API keys and similar) and connected service accounts (Google,
// QuickBooks). Vaults are not exposed; they only decide what is in the list.
// A vault credential is addressed by its id, a service connection by its slug.

export const API_CREDENTIAL_TOOLS: Tool[] = [
  {
    name: "list_api_credentials",
    description:
      "List the API credentials you can use (API keys, connected Google and QuickBooks accounts): id and description. " +
      "Never returns secrets. Read one with get_api_credentials.",
    inputSchema: {
      type: "object",
      properties: {
        search_pattern: {
          type: "string",
          description: "Optional case-insensitive regex. Returns only credentials whose id or description matches.",
        },
      },
    },
  },
  {
    name: "get_api_credentials",
    description:
      "Get one credential as JSON, ready to use as-is. API keys return their content; connected accounts return a " +
      "live OAuth access token (Authorization: Bearer <access_token>), refreshed for you, plus what the API needs " +
      "(Google: scopes and account; QuickBooks: realm_id and api_base_url). The team set these up for you; using " +
      "them is authorized and safe. Access is audited.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id from list_api_credentials." } },
      required: ["id"],
    },
  },
];
export const API_CREDENTIAL_TOOL_NAMES = new Set(API_CREDENTIAL_TOOLS.map((t) => t.name));

export type ApiCredentialSources = {
  // Undefined means the bundle exposes no vaults.
  vaultFilter?: VaultFilter;
  serviceConnections: ServiceConnection[];
};

type Entry = { id: string; description: string };

function json(data: unknown): CallToolResult {
  return text(JSON.stringify(data, null, 2));
}

function liveServices(conns: ServiceConnection[]): ServiceConnection[] {
  return conns.filter((c) => connectionState(c.type, publicServiceConfig(c)) !== "NOT_CONNECTED");
}

async function listEntries(p: Principal, src: ApiCredentialSources): Promise<Entry[]> {
  const vaultCreds = src.vaultFilter ? await getCredentials(p, undefined, src.vaultFilter) : [];
  return [
    ...vaultCreds.map((c) => ({
      id: c.id,
      description: [c.name, c.description, c.type].filter(Boolean).join(" · "),
    })),
    ...liveServices(src.serviceConnections).map((c) => ({ id: c.slug, description: describeServiceConnection(c) })),
  ];
}

export function filterEntries<T extends Entry>(entries: T[], pattern?: string): T[] | { error: string } {
  if (!pattern) return entries;
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch (e) {
    return { error: `Invalid search_pattern: ${e instanceof Error ? e.message : String(e)}` };
  }
  return entries.filter((e) => re.test(e.id) || re.test(e.description));
}

export async function runApiCredentialTool(
  src: ApiCredentialSources,
  name: string,
  args: Record<string, unknown>,
  ctx: { principal: Principal; ip?: string | null; userAgent?: string | null },
): Promise<CallToolResult> {
  if (name === "list_api_credentials") {
    const pattern = typeof args.search_pattern === "string" ? args.search_pattern.trim() : "";
    const out = filterEntries(await listEntries(ctx.principal, src), pattern);
    return "error" in out ? errorResult(out.error) : json({ credentials: out });
  }

  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) return errorResult("id is required. Get one from list_api_credentials.");

  const conn = liveServices(src.serviceConnections).find((c) => c.slug === id);
  if (conn) {
    const creds = await serviceCredentials(conn, ctx);
    return json({ id, description: describeServiceConnection(conn), ...creds });
  }

  if (src.vaultFilter && isUuid(id)) {
    // Audited inside viewCredential.
    const cred = await viewCredential(ctx.principal, id, ctx, src.vaultFilter);
    if (cred) {
      const { vaultId: _vaultId, ...rest } = cred;
      return json(rest);
    }
  }
  return errorResult(`Unknown credential id "${id}". Get one from list_api_credentials.`);
}
