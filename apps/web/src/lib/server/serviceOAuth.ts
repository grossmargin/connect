import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { ServiceConnection } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { http } from "@/lib/server/http";
import { serverEnv } from "@/lib/server/serverEnv";
import { readServiceConfig, updateServiceConfig } from "@/lib/server/serviceConnections";
import {
  GOOGLE_SERVICES,
  requestedSelection,
  scopesFor,
  type GoogleAccess,
  type GoogleServicesConfig,
  type QuickbooksConfig,
  type Selection,
} from "@/lib/isomorphic/serviceConnectionTypes";

// OAuth for service connections: consent URL, code exchange, token refresh.
// Google: https://developers.google.com/identity/protocols/oauth2/web-server
// QuickBooks: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
} as const;

const STATE_TTL_MS = 15 * 60_000;
// Refresh a little before the token really expires.
const EXPIRY_MARGIN_MS = 120_000;

export class ServiceOAuthError extends Error {}

type Client = { clientId: string; clientSecret: string };

function googleClient(): Client {
  const clientId = serverEnv.GOOGLE_SERVICES_CLIENT_ID ?? serverEnv.AUTH_GOOGLE_ID;
  const clientSecret = serverEnv.GOOGLE_SERVICES_CLIENT_SECRET ?? serverEnv.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new ServiceOAuthError("GOOGLE_SERVICES_CLIENT_ID/SECRET are not set");
  return { clientId, clientSecret };
}

function quickbooksClient(): Client {
  const clientId = serverEnv.QUICKBOOKS_CLIENT_ID;
  const clientSecret = serverEnv.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ServiceOAuthError("QUICKBOOKS_CLIENT_ID/SECRET are not set");
  return { clientId, clientSecret };
}

export function quickbooksEnvironment(): "sandbox" | "production" {
  return serverEnv.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function oauthRedirectUri(origin: string): string {
  return `${origin}/api/service-connections/callback`;
}

// ---------- state ----------

type State = { id: string; uid: string; exp: number };

function sign(payload: string): string {
  return createHmac("sha256", serverEnv.AUTH_SECRET).update(payload).digest("base64url");
}

// Signed, short-lived: binds the callback to one connection and one user.
export function signState(connectionId: string, userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ id: connectionId, uid: userId, exp: Date.now() + STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string | null): State | null {
  if (!state) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as State;
  return s.exp > Date.now() ? s : null;
}

// ---------- consent ----------

export function authorizeUrl(conn: ServiceConnection, origin: string, state: string): string {
  const config = readServiceConfig<Record<string, unknown>>(conn);
  const scopes = scopesFor(conn.type, requestedSelection(conn.type, config));
  const params = new URLSearchParams({ response_type: "code", redirect_uri: oauthRedirectUri(origin), state });

  if (conn.type === "google-services") {
    params.set("client_id", googleClient().clientId);
    params.set("scope", scopes.join(" "));
    // offline + consent: always return a refresh token.
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    return `${GOOGLE_AUTH_URL}?${params}`;
  }
  if (conn.type === "quickbooks") {
    params.set("client_id", quickbooksClient().clientId);
    params.set("scope", scopes.join(" "));
    return `${QB_AUTH_URL}?${params}`;
  }
  throw new ServiceOAuthError(`Unknown service type "${conn.type}".`);
}

// ---------- token endpoint ----------

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(type: string, body: Record<string, string>): Promise<TokenResponse> {
  const isQb = type === "quickbooks";
  const client = isQb ? quickbooksClient() : googleClient();
  const form = new URLSearchParams(isQb ? body : { ...body, client_id: client.clientId, client_secret: client.clientSecret });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  // Intuit wants the client in a Basic header.
  if (isQb) headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;

  let res;
  try {
    res = await http.post(isQb ? QB_TOKEN_URL : GOOGLE_TOKEN_URL, form.toString(), { headers });
  } catch (e) {
    throw new ServiceOAuthError(`Token request failed: ${(e as Error).message}`);
  }
  const data = (res.data ?? {}) as TokenResponse;
  if (res.status < 200 || res.status >= 300 || !data.access_token) {
    throw new ServiceOAuthError(
      `Token request failed: HTTP ${res.status} ${data.error ?? ""} ${data.error_description ?? ""}`.trim(),
    );
  }
  return data;
}

function googleGranted(scope: string | undefined): Selection {
  const granted = new Set((scope ?? "").split(/\s+/));
  const out: Selection = {};
  for (const s of GOOGLE_SERVICES) {
    const level: GoogleAccess = granted.has(s.scopes.readwrite)
      ? "readwrite"
      : granted.has(s.scopes.readonly)
        ? "readonly"
        : "none";
    out[s.key] = level;
  }
  return out;
}

// The id_token comes straight from Google's token endpoint over TLS, so its
// payload is trusted without checking the signature.
function emailFromIdToken(idToken: string | undefined): string | undefined {
  const payload = idToken?.split(".")[1];
  if (!payload) return undefined;
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

// Exchanges the callback code for tokens and saves them with what was granted.
export async function completeOAuth(
  conn: ServiceConnection,
  origin: string,
  query: URLSearchParams,
): Promise<ServiceConnection> {
  const code = query.get("code");
  if (!code) throw new ServiceOAuthError(query.get("error_description") ?? query.get("error") ?? "No code returned");
  const t = await tokenRequest(conn.type, {
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthRedirectUri(origin),
  });
  const now = Date.now();
  const tokens = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: now + (t.expires_in ?? 3600) * 1000,
  };

  if (conn.type === "google-services") {
    if (!t.refresh_token) throw new ServiceOAuthError("Google returned no refresh token. Try again.");
    return updateServiceConfig(conn, { ...tokens, granted: googleGranted(t.scope), email: emailFromIdToken(t.id_token) });
  }
  const realmId = query.get("realmId");
  if (!realmId) throw new ServiceOAuthError("QuickBooks returned no realmId.");
  const cfg = readServiceConfig<QuickbooksConfig>(conn);
  return updateServiceConfig(conn, {
    ...tokens,
    refreshTokenExpiresAt: t.x_refresh_token_expires_in ? now + t.x_refresh_token_expires_in * 1000 : undefined,
    // Intuit grants exactly the requested scopes.
    granted: cfg.products,
    realmId,
    environment: quickbooksEnvironment(),
  });
}

// ---------- live credentials ----------

export type ServiceCredentials = {
  access_token: string;
  expires_at: string;
  scopes?: string[];
  account?: string;
  realm_id?: string;
  environment?: string;
  api_base_url?: string;
};

// Returns a valid access token, refreshing (and saving) it when needed.
// `force` always refreshes; the health check uses it to prove the grant is alive.
export async function getServiceCredentials(
  conn: ServiceConnection,
  opts: { force?: boolean } = {},
): Promise<ServiceCredentials> {
  let cfg = readServiceConfig<GoogleServicesConfig & QuickbooksConfig>(conn);
  if (!cfg.granted || !cfg.refreshToken) throw new ServiceOAuthError(`"${conn.name}" is not connected.`);

  if (opts.force || !cfg.accessToken || !cfg.expiresAt || cfg.expiresAt - EXPIRY_MARGIN_MS < Date.now()) {
    const t = await tokenRequest(conn.type, { grant_type: "refresh_token", refresh_token: cfg.refreshToken });
    const now = Date.now();
    const saved = await updateServiceConfig(conn, {
      accessToken: t.access_token,
      expiresAt: now + (t.expires_in ?? 3600) * 1000,
      // Intuit rotates refresh tokens; Google keeps the old one.
      ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
      ...(t.x_refresh_token_expires_in ? { refreshTokenExpiresAt: now + t.x_refresh_token_expires_in * 1000 } : {}),
    });
    cfg = readServiceConfig(saved);
  }

  const base = { access_token: cfg.accessToken!, expires_at: new Date(cfg.expiresAt!).toISOString() };
  if (conn.type === "google-services") {
    return { ...base, scopes: scopesFor(conn.type, cfg.granted as Selection), account: cfg.email };
  }
  const env = cfg.environment ?? "sandbox";
  return { ...base, realm_id: cfg.realmId, environment: env, api_base_url: QB_API_BASE[env] };
}

// ---------- test ----------

export type ServiceTestResult = { ok: true; summary: string } | { ok: false; error: string };

// Refreshes the token to prove the grant still works, and saves the result.
export async function testServiceConnection(conn: ServiceConnection): Promise<ServiceTestResult> {
  let result: ServiceTestResult;
  try {
    const c = await getServiceCredentials(conn, { force: true });
    result = { ok: true, summary: c.account ?? (c.realm_id ? `realm ${c.realm_id}` : "token refreshed") };
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
  await prisma.serviceConnection.update({
    where: { id: conn.id },
    data: { lastTestOk: result.ok, lastTestError: result.ok ? null : result.error, lastTestedAt: new Date() },
  });
  return result;
}
