import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  resolvePrincipal,
  getVaults,
  getCredentials,
  viewCredential,
  type Principal,
  type VaultFilter,
} from "@/lib/server/mcp";
import { connectionStatusReport } from "@/lib/server/mcpStatus";
import { logMcpCall } from "@/lib/server/mcpLog";
import { text, errorResult, resultText, headerValue } from "@/lib/server/mcpToolShared";
import {
  connOwns,
  connToolDefs,
  handleConnCall,
  groupOwns,
  groupToolDefs,
  handleGroupCall,
  type GroupWithTenants,
} from "@/lib/server/publishedTools";
import type { McpConnection } from "@prisma/client";
import {
  wrapperOwns,
  wrapperToolDefs,
  handleWrapperCall,
  type WrapperWithCredentials,
} from "@/lib/server/wrapperTools";

function principalFrom(extra: { authInfo?: AuthInfo }): Principal {
  const p = extra.authInfo?.extra?.principal as Principal | undefined;
  if (!p) throw new Error("unauthenticated");
  return p;
}

function json(data: unknown): CallToolResult {
  return text(JSON.stringify(data, null, 2));
}

type Headers = Record<string, string | string[]> | undefined;

// Sensitive headers we never store verbatim (they carry the bearer / session).
const REDACT = new Set(["authorization", "cookie", "proxy-authorization"]);

// Captures request context to log: caller ip, user-agent and all headers
// (secrets masked). `err` adds the message and stack for a failed call. `extra`
// merges in any source-specific fields (e.g. the wrapper id).
function callDetails(headers: Headers, err?: unknown, extra?: Record<string, unknown>) {
  const all: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    const key = k.toLowerCase();
    all[key] = REDACT.has(key) ? "[redacted]" : Array.isArray(v) ? v.join(", ") : String(v);
  }
  const forwarded = headerValue(headers, "x-forwarded-for");
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? null;
  return {
    ip,
    userAgent: headerValue(headers, "user-agent") ?? null,
    headers: all,
    ...extra,
    ...(err !== undefined && {
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  };
}

const CREDENTIAL_TOOLS: Tool[] = [
  { name: "get_vaults", description: "List vaults you can access.", inputSchema: { type: "object", properties: {} } },
  {
    name: "get_credentials",
    description: "List credential metadata (name, description, type). Never returns secret content.",
    inputSchema: { type: "object", properties: { vaultId: { type: "string", description: "Filter to one vault." } } },
  },
  {
    name: "view_credential",
    description: "Reveal one credential's decrypted secret content. This access is audited.",
    inputSchema: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] },
  },
];
const CREDENTIAL_NAMES = new Set(CREDENTIAL_TOOLS.map((t) => t.name));

const STATUS_TOOL: Tool = {
  name: "mcps_connection_status",
  description:
    "Health-check every configured MCP connection by actually connecting (auth + tools/list). " +
    "Returns results per connection.",
  inputSchema: { type: "object", properties: {} },
};

// Bearer → AuthInfo. When `teamScope` is set, the principal must have access to
// that team and is narrowed to it, so every tool (credentials included) is
// scoped to the mounted team rather than all of the caller's teams.
function makeVerifyToken(teamScope?: string) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    if (!bearer) return undefined;
    const p = await resolvePrincipal(bearer);
    if (!p) return undefined;
    if (teamScope) {
      if (!p.teamIds.includes(teamScope)) return undefined;
      p.teamIds = [teamScope];
    }
    return {
      token: bearer,
      clientId: p.kind === "sa" ? p.serviceAccountId : p.userId,
      scopes: ["credentials:read"],
      extra: { principal: p },
    };
  };
}

async function runCredentialTool(
  p: Principal,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string | string[]> | undefined,
  vaultFilter?: VaultFilter,
): Promise<CallToolResult> {
  if (name === "get_vaults") return json(await getVaults(p, vaultFilter));
  if (name === "get_credentials")
    return json(await getCredentials(p, args.vaultId as string | undefined, vaultFilter));
  // view_credential — audited inside viewCredential.
  const credentialId = String(args.credentialId ?? "");
  if (!credentialId) return errorResult("credentialId is required.");
  const cred = await viewCredential(
    p,
    credentialId,
    {
      ip: headerValue(headers, "x-forwarded-for") ?? null,
      userAgent: headerValue(headers, "user-agent") ?? null,
    },
    vaultFilter,
  );
  return cred ? json(cred) : errorResult("Credential not found.");
}

// The MCP server for one Published MCP: the credential tools plus every tool
// contributed by the endpoint's groups (tenanted) and individual connections,
// plus composed wrappers (all slug-prefixed). Built per request so it reflects
// the caller. Every call is logged to McpCallLog; reveals also write AuditLog.
// `endpoint` is the request path this handler serves (mcp-handler matches it
// exactly against the incoming pathname). `teamScope`, when set, restricts the
// caller to that single team. Both mounts (root and /[teamSlug]) serve one team.
export function buildMcpHandler(
  groups: GroupWithTenants[],
  connections: McpConnection[] = [],
  wrappers: WrapperWithCredentials[] = [],
  instructions?: string,
  opts: { endpoint?: string; teamScope?: string; vaultFilter?: VaultFilter } = {},
) {
  const endpoint = opts.endpoint ?? "/";
  const vaultFilter = opts.vaultFilter;
  // The team this endpoint serves, autodetected from the route. Both the root
  // mount and /[teamSlug] resolve to a single team, so root-source calls
  // (status + credential tools) are attributed to it just like group/connection
  // calls are attributed via their entity's teamId.
  const teamId = opts.teamScope ?? null;
  const handler = createMcpHandler(
    (mcp) => {
      const server = mcp.server;

      server.setRequestHandler(ListToolsRequestSchema, async () => {
        const perGroup = await Promise.all(groups.map((g) => groupToolDefs(g)));
        const perConn = await Promise.all(connections.map((c) => connToolDefs(c)));
        const perWrapper = wrappers.map((w) => wrapperToolDefs(w));
        return {
          tools: [
            ...CREDENTIAL_TOOLS,
            STATUS_TOOL,
            ...perGroup.flat(),
            ...perConn.flat(),
            ...perWrapper.flat(),
          ],
        };
      });

      server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
        const name = req.params.name;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;
        const headers = extra.requestInfo?.headers as Record<string, string | string[]> | undefined;
        const principal = principalFrom(extra);
        const started = Date.now();

        if (name === STATUS_TOOL.name) {
          try {
            const report = await connectionStatusReport(principal);
            await logMcpCall(principal, {
              source: "root",
              teamId,
              toolName: name,
              ok: true,
              durationMs: Date.now() - started,
              details: callDetails(headers),
            });
            return json(report);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "call failed";
            await logMcpCall(principal, {
              source: "root",
              teamId,
              toolName: name,
              ok: false,
              error: msg,
              durationMs: Date.now() - started,
              details: callDetails(headers, e),
            });
            return errorResult(msg);
          }
        }

        if (CREDENTIAL_NAMES.has(name)) {
          try {
            const result = await runCredentialTool(principal, name, args, headers, vaultFilter);
            await logMcpCall(principal, {
              source: "root",
              teamId,
              toolName: name,
              args: name === "view_credential" ? { credentialId: args.credentialId } : args,
              ok: !result.isError,
              error: result.isError ? resultText(result) : null,
              durationMs: Date.now() - started,
              details: callDetails(headers, result.isError ? resultText(result) : undefined),
            });
            return result;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "call failed";
            await logMcpCall(principal, {
              source: "root",
              teamId,
              toolName: name,
              args,
              ok: false,
              error: msg,
              durationMs: Date.now() - started,
              details: callDetails(headers, e),
            });
            return errorResult(msg);
          }
        }

        const group = groups.find((g) => groupOwns(g, name));
        if (group) {
          try {
            const out = await handleGroupCall(group, name, args);
            const failed = !!out.result.isError;
            await logMcpCall(principal, {
              source: "group",
              teamId: group.teamId,
              toolsetId: group.id,
              connectionId: out.connectionId,
              tenant: out.tenant,
              toolName: name,
              args,
              ok: !failed,
              error: failed ? resultText(out.result) : null,
              durationMs: Date.now() - started,
              details: callDetails(headers, failed ? resultText(out.result) : undefined),
            });
            return out.result;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "call failed";
            await logMcpCall(principal, {
              source: "group",
              teamId: group.teamId,
              toolsetId: group.id,
              tenant: typeof args.tenant === "string" ? args.tenant : null,
              toolName: name,
              args,
              ok: false,
              error: msg,
              durationMs: Date.now() - started,
              details: callDetails(headers, e),
            });
            return errorResult(msg);
          }
        }

        const conn = connections.find((c) => connOwns(c, name));
        if (conn) {
          try {
            const out = await handleConnCall(conn, name, args);
            const failed = !!out.result.isError;
            await logMcpCall(principal, {
              source: "connection",
              teamId: conn.teamId,
              connectionId: out.connectionId,
              toolName: name,
              args,
              ok: !failed,
              error: failed ? resultText(out.result) : null,
              durationMs: Date.now() - started,
              details: callDetails(headers, failed ? resultText(out.result) : undefined),
            });
            return out.result;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "call failed";
            await logMcpCall(principal, {
              source: "connection",
              teamId: conn.teamId,
              connectionId: conn.id,
              toolName: name,
              args,
              ok: false,
              error: msg,
              durationMs: Date.now() - started,
              details: callDetails(headers, e),
            });
            return errorResult(msg);
          }
        }

        const wrapper = wrappers.find((w) => wrapperOwns(w, name));
        if (wrapper) {
          try {
            const out = await handleWrapperCall(wrapper, name, args);
            const failed = !!out.result.isError;
            await logMcpCall(principal, {
              source: "wrapper",
              teamId: wrapper.teamId,
              toolName: name,
              args,
              ok: !failed,
              error: failed ? resultText(out.result) : null,
              durationMs: Date.now() - started,
              details: callDetails(headers, failed ? resultText(out.result) : undefined, {
                wrapperId: wrapper.id,
              }),
            });
            return out.result;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "call failed";
            await logMcpCall(principal, {
              source: "wrapper",
              teamId: wrapper.teamId,
              toolName: name,
              args,
              ok: false,
              error: msg,
              durationMs: Date.now() - started,
              details: callDetails(headers, e, { wrapperId: wrapper.id }),
            });
            return errorResult(msg);
          }
        }

        return errorResult(`Unknown tool "${name}".`);
      });
    },
    { capabilities: { tools: {} }, instructions },
    { streamableHttpEndpoint: endpoint },
  );

  return withMcpAuth(handler, makeVerifyToken(opts.teamScope), {
    required: true,
    requiredScopes: ["credentials:read"],
  });
}
