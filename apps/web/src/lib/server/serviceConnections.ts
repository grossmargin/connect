import "server-only";
import type { Prisma, ServiceConnection } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { decrypt, encrypt } from "@/lib/server/crypto";
import { secretFieldNames, serviceTypeDef, type NangoServiceConfig } from "@/lib/isomorphic/serviceConnectionTypes";
import { listNangoConnections } from "@/lib/server/serviceNango";

// Storage for service connections: one schema per type, split into plain
// `config` and encrypted `secrets` on write and joined back on read.

const TEST_TIMEOUT_MS = 30_000;

type Values = Record<string, unknown>;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

function toBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

function readSecrets(secrets: Uint8Array | null): Values {
  if (!secrets) return {};
  return JSON.parse(decrypt(Buffer.from(secrets))) as Values;
}

// Validates `input` against the type's schema and splits it for storage. On
// edit, pass the stored row as `prev`: a secret field left empty keeps its
// stored value.
export function packServiceConfig(
  type: string,
  input: Values,
  prev?: Pick<ServiceConnection, "secrets"> | null,
): { config: Prisma.InputJsonObject; secrets: Uint8Array<ArrayBuffer> } | { error: string } {
  const def = serviceTypeDef(type);
  if (!def) return { error: `Unknown service type "${type}".` };
  const secretNames = secretFieldNames(def);

  const merged: Values = { ...input };
  if (prev) {
    const stored = readSecrets(prev.secrets);
    for (const n of secretNames) {
      if (merged[n] === undefined || merged[n] === null || merged[n] === "") merged[n] = stored[n];
    }
  }

  const parsed = def.schema.safeParse(merged);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };

  const config: Values = {};
  const secrets: Values = {};
  for (const [k, v] of Object.entries(parsed.data)) (secretNames.includes(k) ? secrets : config)[k] = v;
  return { config: config as Prisma.InputJsonObject, secrets: toBytes(encrypt(JSON.stringify(secrets))) };
}

// Joins `config` and decrypted `secrets` and parses them with the type's schema.
export function readServiceConfig<T = Values>(conn: Pick<ServiceConnection, "type" | "config" | "secrets">): T {
  const def = serviceTypeDef(conn.type);
  if (!def) throw new Error(`Unknown service type "${conn.type}".`);
  const config = conn.config && typeof conn.config === "object" ? (conn.config as Values) : {};
  return def.schema.parse({ ...config, ...readSecrets(conn.secrets) }) as T;
}

// Only the non-secret fields, safe to send to the browser.
export function publicServiceConfig(conn: Pick<ServiceConnection, "config">): Record<string, string> {
  const config = conn.config && typeof conn.config === "object" ? (conn.config as Values) : {};
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v ?? "")]));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function probe(conn: ServiceConnection): Promise<string> {
  if (conn.type === "nango") {
    const list = await listNangoConnections(readServiceConfig<NangoServiceConfig>(conn));
    return `${list.length} connection(s)`;
  }
  throw new Error(`Unknown service type "${conn.type}".`);
}

export type ServiceTestResult = { ok: true; summary: string } | { ok: false; error: string };

// Calls the service with the stored config and saves the result on the row.
export async function testServiceConnection(conn: ServiceConnection): Promise<ServiceTestResult> {
  let result: ServiceTestResult;
  try {
    result = { ok: true, summary: await withTimeout(probe(conn), TEST_TIMEOUT_MS) };
  } catch (e) {
    result = { ok: false, error: errorMessage(e) };
  }
  await prisma.serviceConnection.update({
    where: { id: conn.id },
    data: { lastTestOk: result.ok, lastTestError: result.ok ? null : result.error, lastTestedAt: new Date() },
  });
  return result;
}
