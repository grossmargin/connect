import "server-only";
import type { McpConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { readCredentials } from "@/lib/server/mcpCredentials";
import { probeConn } from "@/lib/server/upstream";
import type { ToolInfo } from "@/lib/server/mcpClient";
import { fetchNangoToken, parseNangoRef } from "@/lib/server/nango";

// Live health checks for MCP connections and NANGO credentials. Used by the
// hourly cron and the Connection Statuses page.

const CHECK_TIMEOUT_MS = 30_000;
const CONCURRENCY = 8;

// "skipped": nothing to test (MCP connection has no credentials yet).
export type HealthStatus = "ok" | "error" | "skipped";

export type McpHealth = {
  id: string;
  name: string;
  slug: string;
  url: string;
  status: HealthStatus;
  error?: string;
  toolCount?: number;
  durationMs: number;
};

export type NangoHealth = {
  id: string;
  name: string;
  vaultId: string;
  vaultName: string;
  connectionId: string | null;
  providerConfigKey: string | null;
  status: HealthStatus;
  error?: string;
  durationMs: number;
};

export type TeamHealth = { teamId: string; mcp: McpHealth[]; nango: NangoHealth[]; checkedAt: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type McpTestResult = { ok: true; tools: ToolInfo[]; instructions?: string } | { ok: false; error: string };

// Runs tools/list against the server and saves the result: status, lastError,
// lastTestedAt and a ConnectionTestLog row. Caller checks that credentials exist.
export async function testMcpConnection(conn: McpConnection): Promise<McpTestResult> {
  const startedAt = Date.now();
  const details: Record<string, unknown> = {
    connectionId: conn.id,
    name: conn.name,
    slug: conn.slug,
    url: conn.url,
    authType: conn.authType,
    startedAt: new Date(startedAt).toISOString(),
  };
  const log = (ok: boolean) =>
    prisma.connectionTestLog.create({
      data: { teamId: conn.teamId, connectionId: conn.id, ok, details: details as Prisma.InputJsonValue },
    });

  try {
    // Opens the right upstream (remote or local stdio) and, for OAuth,
    // refreshes and saves the token.
    const { tools, instructions } = await withTimeout(probeConn(conn), CHECK_TIMEOUT_MS);
    const now = new Date();
    details.durationMs = Date.now() - startedAt;
    details.toolCount = tools.length;
    details.toolNames = tools.map((t) => t.name);
    details.tools = tools;
    details.hasInstructions = !!instructions;
    details.instructionsLength = instructions?.length ?? 0;
    details.instructionsPreview = instructions?.slice(0, 2000);
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { status: "CONNECTED", lastConnectedAt: now, lastTestedAt: now, lastError: null },
    });
    await log(true);
    return { ok: true, tools, instructions };
  } catch (e) {
    const msg = errorMessage(e);
    details.durationMs = Date.now() - startedAt;
    details.error = msg;
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: msg, lastTestedAt: new Date() },
    });
    await log(false);
    return { ok: false, error: msg };
  }
}

async function checkMcp(conn: McpConnection): Promise<McpHealth> {
  const base = { id: conn.id, name: conn.name, slug: conn.slug, url: conn.url };
  const startedAt = Date.now();
  let hasCreds: boolean;
  try {
    hasCreds = !!readCredentials(conn.encryptedCredentials);
  } catch (e) {
    return { ...base, status: "error", error: errorMessage(e), durationMs: 0 };
  }
  if (!hasCreds) return { ...base, status: "skipped", error: "Not registered", durationMs: 0 };

  const r = await testMcpConnection(conn);
  const durationMs = Date.now() - startedAt;
  return r.ok
    ? { ...base, status: "ok", toolCount: r.tools.length, durationMs }
    : { ...base, status: "error", error: r.error, durationMs };
}

type NangoCred = { id: string; name: string; credentialRef: Prisma.JsonValue; vault: { id: string; name: string } };

// Fetches a token from Nango. Nango refreshes it, so success means the
// connection is authorized. No DB field for this; result is not saved.
async function checkNango(cred: NangoCred): Promise<NangoHealth> {
  const ref = parseNangoRef(cred.credentialRef);
  const base = {
    id: cred.id,
    name: cred.name,
    vaultId: cred.vault.id,
    vaultName: cred.vault.name,
    connectionId: ref?.connectionId ?? null,
    providerConfigKey: ref?.providerConfigKey ?? null,
  };
  if (!ref) return { ...base, status: "error", error: "Invalid Nango reference", durationMs: 0 };
  const startedAt = Date.now();
  try {
    await withTimeout(fetchNangoToken(ref), CHECK_TIMEOUT_MS);
    return { ...base, status: "ok", durationMs: Date.now() - startedAt };
  } catch (e) {
    return { ...base, status: "error", error: errorMessage(e), durationMs: Date.now() - startedAt };
  }
}

const nangoCredSelect = { id: true, name: true, credentialRef: true, vault: { select: { id: true, name: true } } };

export async function checkTeamHealth(teamId: string): Promise<TeamHealth> {
  const [conns, creds] = await Promise.all([
    prisma.mcpConnection.findMany({ where: { teamId }, orderBy: { name: "asc" } }),
    prisma.credential.findMany({
      where: { type: "NANGO", vault: { teamId } },
      select: nangoCredSelect,
      orderBy: { name: "asc" },
    }),
  ]);
  const [mcp, nango] = await Promise.all([mapLimit(conns, CONCURRENCY, checkMcp), mapLimit(creds, CONCURRENCY, checkNango)]);
  return { teamId, mcp, nango, checkedAt: new Date().toISOString() };
}

// Checks every team. Teams run one after another; items inside a team run in parallel.
export async function checkAllHealth(): Promise<TeamHealth[]> {
  const teams = await prisma.team.findMany({ select: { id: true } });
  const out: TeamHealth[] = [];
  for (const t of teams) out.push(await checkTeamHealth(t.id));
  return out;
}
