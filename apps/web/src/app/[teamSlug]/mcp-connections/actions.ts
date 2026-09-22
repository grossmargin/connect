"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { audit } from "@/lib/server/audit";
import { kvSet } from "@/lib/server/kv";
import { packCredentials, readCredentials, parseHeaderText } from "@/lib/server/mcpCredentials";
import {
  assertDcrSupported,
  registerConnection,
  deregisterConnection,
  buildAuthorization,
  resolveAuthHeaders,
  probeServer,
  type ToolInfo,
} from "@/lib/server/mcpClient";
import { slugify } from "@/lib/isomorphic/slug";
import { OAUTH_STATE_NS, OAUTH_STATE_TTL_SECONDS } from "./constants";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

export async function createConnection(
  teamId: string,
  name: string,
  url: string,
): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName || !trimmedUrl) return { error: "Name and URL are required." };
  try {
    new URL(trimmedUrl);
  } catch {
    return { error: "URL is not valid." };
  }

  // Only check the server supports DCR in principle. The client is minted at
  // authorize time, not here.
  try {
    await assertDcrSupported(trimmedUrl);
  } catch (e) {
    return { error: `Could not connect: ${errorMessage(e)}` };
  }

  try {
    const conn = await prisma.mcpConnection.create({
      data: {
        teamId,
        name: trimmedName,
        slug: slugify(trimmedName),
        url: trimmedUrl,
        authType: "DCR",
        status: "PENDING",
        createdById: user.id,
      },
    });
    revalidatePath(`/${teamId}/mcp-connections`);
    return { id: conn.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An id derived from this name already exists. Pick another name." };
    }
    return { error: errorMessage(e) };
  }
}

// Creates a connection that authenticates with static, user-supplied HTTP
// headers (no OAuth/DCR). `headersText` is the plain textarea input: one
// `Name: value` per line. The parsed map is encrypted at rest like any other
// credential. Nothing is verified here — the user runs "Test" afterwards.
export async function createHeadersConnection(
  teamId: string,
  name: string,
  url: string,
  headersText: string,
): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName || !trimmedUrl) return { error: "Name and URL are required." };
  try {
    new URL(trimmedUrl);
  } catch {
    return { error: "URL is not valid." };
  }

  let headers: Record<string, string>;
  try {
    headers = parseHeaderText(headersText);
  } catch (e) {
    return { error: `Headers: ${errorMessage(e)}` };
  }
  if (Object.keys(headers).length === 0) {
    return { error: "Enter at least one header (e.g. `Authorization: Bearer <token>`)." };
  }

  try {
    const conn = await prisma.mcpConnection.create({
      data: {
        teamId,
        name: trimmedName,
        slug: slugify(trimmedName),
        url: trimmedUrl,
        authType: "HEADERS",
        status: "REGISTERED",
        encryptedCredentials: packCredentials({ authType: "HEADERS", headers }),
        createdById: user.id,
      },
    });
    revalidatePath(`/${teamId}/mcp-connections`);
    return { id: conn.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An id derived from this name already exists. Pick another name." };
    }
    return { error: errorMessage(e) };
  }
}

export async function updateConnection(
  teamId: string,
  connectionId: string,
  name: string,
  slug: string,
): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const conn = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.teamId !== teamId) return { error: "not found" };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Name is required." };
  const cleanSlug = slugify(slug || trimmedName);

  try {
    await prisma.mcpConnection.update({
      where: { id: connectionId },
      data: { name: trimmedName, slug: cleanSlug },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That id is already in use." };
    }
    return { error: errorMessage(e) };
  }
  revalidatePath(`/${teamId}/mcp-connections`);
  revalidatePath(`/${teamId}/mcp-connections/${connectionId}`);
}

export async function deleteConnection(teamId: string, connectionId: string): Promise<void> {
  await requireMember(teamId);
  await prisma.mcpConnection.deleteMany({ where: { id: connectionId, teamId } });
  revalidatePath(`/${teamId}/mcp-connections`);
}

// Starts the OAuth authorization-code flow and returns the URL to send the user
// to. The PKCE verifier is held in the KV store keyed by an unguessable state
// token.
//
// `rotate` picks the client:
//   false - reuse the existing DCR client. Non-destructive: the callback only
//           writes creds on success, so abandoning the flow keeps the current
//           token. Fails if the connection has no client yet.
//   true  - de-register the old client (when possible) and register a fresh
//           one. Fixes a stale or half-provisioned client (e.g. Brex's DCR that
//           does not wire the redirect into its Okta app).
// A connection with no client yet (PENDING) always registers, regardless.
export async function startAuthorize(
  teamId: string,
  connectionId: string,
  rotate = false,
): Promise<{ url: string } | { error: string }> {
  await requireMember(teamId);
  const conn = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.teamId !== teamId) return { error: "not found" };
  if (conn.authType !== "DCR") return { error: "Connection does not use OAuth." };

  try {
    const previous = readCredentials(conn.encryptedCredentials);
    const existing = previous?.authType === "DCR" ? previous : null;

    let creds = existing;
    if (rotate || !existing) {
      if (existing) await deregisterConnection(existing);
      creds = await registerConnection(conn.url, conn.name);
      await prisma.mcpConnection.update({
        where: { id: conn.id },
        data: { status: "REGISTERED", lastError: null, encryptedCredentials: packCredentials(creds) },
      });
      revalidatePath(`/${teamId}/mcp-connections/${connectionId}`);
    }

    const state = randomBytes(24).toString("base64url");
    const { authorizationUrl, codeVerifier } = await buildAuthorization(conn, creds!, state);
    await kvSet(teamId, OAUTH_STATE_NS, state, { connectionId, codeVerifier }, OAUTH_STATE_TTL_SECONDS);
    return { url: authorizationUrl };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Runs tools/list against the server, refreshing the token if needed.
export async function testConnection(
  teamId: string,
  connectionId: string,
): Promise<{ tools: ToolInfo[]; instructions?: string } | { error: string }> {
  await requireMember(teamId);
  const conn = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.teamId !== teamId) return { error: "not found" };

  const startedAt = Date.now();
  const details: Record<string, unknown> = {
    connectionId,
    name: conn.name,
    slug: conn.slug,
    url: conn.url,
    authType: conn.authType,
    startedAt: new Date(startedAt).toISOString(),
  };

  try {
    const creds = readCredentials(conn.encryptedCredentials);
    if (!creds) return { error: "Connection is not registered." };

    const { headers, refreshedCreds } = await resolveAuthHeaders(conn, creds);
    details.tokenRefreshed = !!refreshedCreds;
    if (refreshedCreds) {
      await prisma.mcpConnection.update({
        where: { id: connectionId },
        data: { encryptedCredentials: packCredentials(refreshedCreds) },
      });
    }
    const { tools, instructions } = await probeServer(conn, headers);
    const now = new Date();
    details.durationMs = Date.now() - startedAt;
    details.toolCount = tools.length;
    details.toolNames = tools.map((t) => t.name);
    details.tools = tools;
    details.hasInstructions = !!instructions;
    details.instructionsLength = instructions?.length ?? 0;
    details.instructionsPreview = instructions?.slice(0, 2000);

    await prisma.mcpConnection.update({
      where: { id: connectionId },
      data: { status: "CONNECTED", lastConnectedAt: now, lastTestedAt: now, lastError: null },
    });
    await prisma.connectionTestLog.create({ data: { teamId, connectionId, ok: true, details: details as Prisma.InputJsonValue } });
    revalidatePath(`/${teamId}/mcp-connections`);
    return { tools, instructions };
  } catch (e) {
    const msg = errorMessage(e);
    details.durationMs = Date.now() - startedAt;
    details.error = msg;
    await prisma.mcpConnection.update({
      where: { id: connectionId },
      data: { status: "ERROR", lastError: msg, lastTestedAt: new Date() },
    });
    await prisma.connectionTestLog.create({ data: { teamId, connectionId, ok: false, details: details as Prisma.InputJsonValue } });
    revalidatePath(`/${teamId}/mcp-connections`);
    return { error: msg };
  }
}

// Keeps a secret's first/last chars and hides the middle.
function maskSecret(s: string | undefined | null): string | null {
  if (!s) return null;
  if (s.length <= 10) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

// Decodes a JWT's payload claims. Returns null when the token is not a JWT.
function decodeJwtClaims(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// A technical summary of what we store for a connection. Secrets are masked
// unless `reveal` is set, in which case the full read is written to the audit
// log. `null` values mean "not stored".
export async function getConnectionCredentials(
  teamId: string,
  connectionId: string,
  reveal: boolean,
): Promise<{ summary: Record<string, unknown> } | { error: string }> {
  const user = await requireMember(teamId);
  const conn = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.teamId !== teamId) return { error: "not found" };

  const creds = readCredentials(conn.encryptedCredentials);
  if (!creds) return { error: "No credentials stored for this connection." };

  const show = (s: string | undefined | null) => (reveal ? (s ?? null) : maskSecret(s));

  if (reveal) {
    const h = await headers();
    await audit({
      actorType: "USER",
      actorId: user.id,
      action: "VIEW_CONNECTION_SECRETS",
      source: "UI",
      teamId,
      connectionId,
      ip: h.get("x-forwarded-for"),
      userAgent: h.get("user-agent"),
    });
  }

  const common = {
    protocolType: creds.authType,
    status: conn.status,
    serverUrl: conn.url,
    lastConnectedAt: conn.lastConnectedAt?.toISOString() ?? null,
    lastTestedAt: conn.lastTestedAt?.toISOString() ?? null,
    revealed: reveal,
  };

  if (creds.authType === "HEADERS") {
    // Each header value is a secret: masked unless revealed (and the reveal is
    // audited above).
    const headers: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(creds.headers)) headers[k] = show(v);
    return { summary: { ...common, headers } };
  }

  return {
    summary: {
      ...common,
      authorizationServerUrl: creds.authorizationServerUrl ?? null,
      resource: creds.resource ?? null,
      scope: creds.scope ?? null,
      clientId: creds.clientId,
      clientSecret: show(creds.clientSecret),
      accessToken: show(creds.accessToken),
      accessTokenClaims: decodeJwtClaims(creds.accessToken),
      accessTokenExpiresAt: creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt).toISOString() : null,
      refreshToken: show(creds.refreshToken),
      hasRefreshToken: !!creds.refreshToken,
    },
  };
}
