import "server-only";
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthorizationServerMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "@prisma/client";
import type { DcrCredentials, McpCredentials } from "@/lib/mcpCredentials";

// HTTP headers attached to every request to an upstream server. For DCR this is
// just an OAuth bearer; for HEADERS it's the user-supplied header map.
export type AuthHeaders = Record<string, string>;

const FETCH_TIMEOUT_MS = 10_000;

// fetch with a hard timeout, so a stuck or slow remote server can't hang a
// request forever. Combines any caller-provided signal with the timeout.
const timeoutFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

export function callbackUrl(): string {
  const base = (process.env.APP_URL ?? "http://localhost:3069").replace(/\/$/, "");
  // Conventional loopback path many MCP servers (e.g. Ramp) auto-trust.
  return `${base}/callback`;
}

async function discover(url: string) {
  const info = await discoverOAuthServerInfo(url, { fetchFn: timeoutFetch });
  return {
    authorizationServerUrl: info.authorizationServerUrl,
    metadata: info.authorizationServerMetadata as AuthorizationServerMetadata | undefined,
    resource: info.resourceMetadata?.resource ?? url,
    scope: info.resourceMetadata?.scopes_supported?.join(" "),
  };
}

// Verifies the URL and that the server supports Dynamic Client Registration,
// then registers this app as a client. Returns credentials without tokens.
export async function registerConnection(url: string, name: string): Promise<DcrCredentials> {
  const d = await discover(url);
  if (!d.metadata?.registration_endpoint) {
    throw new Error("Server does not advertise a Dynamic Client Registration endpoint.");
  }
  const client = await registerClient(d.authorizationServerUrl, {
    metadata: d.metadata,
    scope: d.scope,
    fetchFn: timeoutFetch,
    clientMetadata: {
      client_name: `Grossmargin Connect: ${name}`,
      redirect_uris: [callbackUrl()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: d.scope,
    },
  });
  return {
    authType: "DCR",
    clientId: client.client_id,
    clientSecret: client.client_secret,
    authorizationServerUrl: d.authorizationServerUrl,
    resource: d.resource,
    scope: d.scope,
  };
}

// Builds the authorization redirect URL and returns the PKCE verifier to persist.
export async function buildAuthorization(conn: McpConnection, creds: DcrCredentials, state: string) {
  const d = await discover(conn.url);
  const { authorizationUrl, codeVerifier } = await startAuthorization(d.authorizationServerUrl, {
    metadata: d.metadata,
    clientInformation: { client_id: creds.clientId, client_secret: creds.clientSecret },
    redirectUrl: callbackUrl(),
    scope: creds.scope ?? d.scope,
    state,
    resource: new URL(creds.resource ?? conn.url),
  });
  return { authorizationUrl: authorizationUrl.toString(), codeVerifier };
}

export async function exchangeCode(
  conn: McpConnection,
  creds: DcrCredentials,
  code: string,
  codeVerifier: string,
): Promise<OAuthTokens> {
  const d = await discover(conn.url);
  return exchangeAuthorization(d.authorizationServerUrl, {
    metadata: d.metadata,
    clientInformation: { client_id: creds.clientId, client_secret: creds.clientSecret },
    authorizationCode: code,
    codeVerifier,
    redirectUri: callbackUrl(),
    resource: new URL(creds.resource ?? conn.url),
    fetchFn: timeoutFetch,
  });
}

export function tokensToCredentials(creds: DcrCredentials, tokens: OAuthTokens): DcrCredentials {
  return {
    ...creds,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? creds.refreshToken,
    tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

// Returns a valid access token, refreshing if it has expired. When it refreshes,
// `refreshedCreds` carries the updated credentials for the caller to persist.
export async function ensureAccessToken(
  conn: McpConnection,
  creds: DcrCredentials,
): Promise<{ accessToken: string; refreshedCreds?: DcrCredentials }> {
  if (!creds.accessToken) throw new Error("Connection is not authorized yet.");

  const expired = creds.tokenExpiresAt ? creds.tokenExpiresAt <= Date.now() + 30_000 : false;
  if (!expired || !creds.refreshToken) return { accessToken: creds.accessToken };

  const d = await discover(conn.url);
  const tokens = await refreshAuthorization(d.authorizationServerUrl, {
    metadata: d.metadata,
    clientInformation: { client_id: creds.clientId, client_secret: creds.clientSecret },
    refreshToken: creds.refreshToken,
    fetchFn: timeoutFetch,
  });
  const refreshedCreds = tokensToCredentials(creds, tokens);
  return { accessToken: refreshedCreds.accessToken!, refreshedCreds };
}

// Resolves a connection's credentials into the headers to attach to requests.
// For DCR it returns an OAuth bearer, refreshing the token if needed (the
// refreshed credentials come back in `refreshedCreds` for the caller to
// persist). For HEADERS it returns the stored header map as-is.
export async function resolveAuthHeaders(
  conn: McpConnection,
  creds: McpCredentials,
): Promise<{ headers: AuthHeaders; refreshedCreds?: DcrCredentials }> {
  if (creds.authType === "HEADERS") return { headers: { ...creds.headers } };
  const { accessToken, refreshedCreds } = await ensureAccessToken(conn, creds);
  return { headers: { Authorization: `Bearer ${accessToken}` }, refreshedCreds };
}

export type ToolInfo = { name: string; description?: string };
export type ProbeResult = { tools: ToolInfo[]; instructions?: string };

// Connects to one MCP URL with the given auth headers and returns its tools +
// instructions.
export async function probeUrl(url: string, headers: AuthHeaders): Promise<ProbeResult> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
    fetch: timeoutFetch,
  });
  const client = new Client({ name: "grossmargin-connect", version: "0.1.0" });
  try {
    await client.connect(transport);
    const instructions = client.getInstructions();
    const res = await client.listTools();
    return {
      tools: res.tools.map((t) => ({ name: t.name, description: t.description })),
      instructions: instructions || undefined,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

export function probeServer(conn: McpConnection, headers: AuthHeaders): Promise<ProbeResult> {
  return probeUrl(conn.url, headers);
}

// Connects, runs `fn` with the client, and always closes it.
async function withClient<T>(url: string, headers: AuthHeaders, fn: (c: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
    fetch: timeoutFetch,
  });
  const client = new Client({ name: "grossmargin-connect", version: "0.1.0" });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

// Full upstream tool definitions (including inputSchema) plus instructions.
export function fetchToolDefs(
  url: string,
  headers: AuthHeaders,
): Promise<{ tools: Tool[]; instructions?: string }> {
  return withClient(url, headers, async (c) => {
    const instructions = c.getInstructions();
    const res = await c.listTools();
    return { tools: res.tools, instructions: instructions || undefined };
  });
}

export function callUpstreamTool(
  url: string,
  headers: AuthHeaders,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return withClient(url, headers, (c) => c.callTool({ name, arguments: args })) as Promise<CallToolResult>;
}
