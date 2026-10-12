import "server-only";
import type { Prisma, ServiceConnection } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { decrypt, encrypt } from "@/lib/server/crypto";
import { serviceTypeDef } from "@/lib/isomorphic/serviceConnectionTypes";

// Storage for service connections: one schema per type, split into plain
// `config` and encrypted `secrets` on write and joined back on read.

type Values = Record<string, unknown>;
type Row = Pick<ServiceConnection, "type" | "config" | "secrets">;

function toBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

function readSecrets(secrets: Uint8Array | null): Values {
  if (!secrets) return {};
  return JSON.parse(decrypt(Buffer.from(secrets))) as Values;
}

function plainConfig(conn: Pick<ServiceConnection, "config">): Values {
  return conn.config && typeof conn.config === "object" && !Array.isArray(conn.config) ? (conn.config as Values) : {};
}

// Validates `values` against the type's schema and splits it for storage.
export function packServiceConfig(
  type: string,
  values: Values,
): { config: Prisma.InputJsonObject; secrets: Uint8Array<ArrayBuffer> } | { error: string } {
  const def = serviceTypeDef(type);
  if (!def) return { error: `Unknown service type "${type}".` };
  const parsed = def.schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };

  const config: Values = {};
  const secrets: Values = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    (def.secretFields.includes(k) ? secrets : config)[k] = v;
  }
  return { config: config as Prisma.InputJsonObject, secrets: toBytes(encrypt(JSON.stringify(secrets))) };
}

// Joins `config` and decrypted `secrets` and parses them with the type's schema.
export function readServiceConfig<T = Values>(conn: Row): T {
  const def = serviceTypeDef(conn.type);
  if (!def) throw new Error(`Unknown service type "${conn.type}".`);
  return def.schema.parse({ ...plainConfig(conn), ...readSecrets(conn.secrets) }) as T;
}

// Only the non-secret fields, safe to send to the browser.
export function publicServiceConfig(conn: Pick<ServiceConnection, "config">): Values {
  return plainConfig(conn);
}

// Merges `patch` into the stored config (secrets included) and saves it.
export async function updateServiceConfig(conn: ServiceConnection, patch: Values): Promise<ServiceConnection> {
  const packed = packServiceConfig(conn.type, { ...readServiceConfig(conn), ...patch });
  if ("error" in packed) throw new Error(packed.error);
  return prisma.serviceConnection.update({
    where: { id: conn.id },
    data: { config: packed.config, secrets: packed.secrets },
  });
}
