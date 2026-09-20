import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Generic, untyped key/value store for cache and transient state. Values are
// whatever the caller puts in; nothing here validates their shape.
export type JsonValue = Prisma.InputJsonValue;

function expired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() < Date.now();
}

export async function kvSet(
  teamId: string,
  namespace: string,
  key: string,
  value: JsonValue,
  ttlSeconds?: number,
): Promise<void> {
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
  await prisma.keyValueStore.upsert({
    where: { teamId_namespace_key: { teamId, namespace, key } },
    create: { teamId, namespace, key, value, expiresAt },
    update: { value, expiresAt },
  });
}

export async function kvGet<T = unknown>(teamId: string, namespace: string, key: string): Promise<T | null> {
  const row = await prisma.keyValueStore.findUnique({
    where: { teamId_namespace_key: { teamId, namespace, key } },
  });
  if (!row) return null;
  if (expired(row.expiresAt)) {
    await kvDelete(teamId, namespace, key);
    return null;
  }
  return row.value as T;
}

// Looks up by namespace+key across teams. Use only for unguessable keys
// (e.g. random OAuth state). Returns the value plus the owning teamId.
export async function kvTake<T = unknown>(
  namespace: string,
  key: string,
): Promise<{ teamId: string; value: T } | null> {
  const row = await prisma.keyValueStore.findFirst({ where: { namespace, key } });
  if (!row) return null;
  await prisma.keyValueStore.delete({ where: { id: row.id } }).catch(() => {});
  if (expired(row.expiresAt)) return null;
  return { teamId: row.teamId, value: row.value as T };
}

export async function kvDelete(teamId: string, namespace: string, key: string): Promise<void> {
  await prisma.keyValueStore.deleteMany({ where: { teamId, namespace, key } });
}
