"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { slugify } from "@/lib/isomorphic/slug";
import { serviceTypeDef } from "@/lib/isomorphic/serviceConnectionTypes";
import { packServiceConfig, testServiceConnection, type ServiceTestResult } from "@/lib/server/serviceConnections";

type Input = { name: string; slug?: string; values: Record<string, string> };

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

async function revalidate(teamId: string) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (t) revalidatePath(`/${t.slug}/service-connections`);
}

function cleanSlug(input: Input): string {
  return slugify(input.slug?.trim() || input.name);
}

function saveError(e: unknown): { error: string } {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { error: "Another service connection already uses this id." };
  }
  return { error: e instanceof Error ? e.message : "Unexpected error" };
}

// Saves the connection, then tests it. The connection is kept when the test fails.
export async function createServiceConnection(
  teamId: string,
  type: string,
  input: Input,
): Promise<{ id: string; test: ServiceTestResult } | { error: string }> {
  const user = await requireMember(teamId);
  if (!serviceTypeDef(type)) return { error: `Unknown service type "${type}".` };
  if (!input.name.trim()) return { error: "Name is required." };
  const packed = packServiceConfig(type, input.values);
  if ("error" in packed) return packed;

  let conn;
  try {
    conn = await prisma.serviceConnection.create({
      data: {
        teamId,
        type,
        name: input.name.trim(),
        slug: cleanSlug(input),
        config: packed.config,
        secrets: packed.secrets,
        createdById: user.id,
      },
    });
  } catch (e) {
    return saveError(e);
  }
  const test = await testServiceConnection(conn);
  await revalidate(teamId);
  return { id: conn.id, test };
}

// An empty secret field keeps the stored value.
export async function updateServiceConnection(
  teamId: string,
  id: string,
  input: Input,
): Promise<{ test: ServiceTestResult } | { error: string }> {
  await requireMember(teamId);
  const prev = await prisma.serviceConnection.findFirst({ where: { id, teamId } });
  if (!prev) return { error: "not found" };
  if (!input.name.trim()) return { error: "Name is required." };
  const packed = packServiceConfig(prev.type, input.values, prev);
  if ("error" in packed) return packed;

  let conn;
  try {
    conn = await prisma.serviceConnection.update({
      where: { id },
      data: { name: input.name.trim(), slug: cleanSlug(input), config: packed.config, secrets: packed.secrets },
    });
  } catch (e) {
    return saveError(e);
  }
  const test = await testServiceConnection(conn);
  await revalidate(teamId);
  return { test };
}

export async function testServiceConnectionAction(
  teamId: string,
  id: string,
): Promise<ServiceTestResult | { error: string }> {
  await requireMember(teamId);
  const conn = await prisma.serviceConnection.findFirst({ where: { id, teamId } });
  if (!conn) return { error: "not found" };
  const r = await testServiceConnection(conn);
  await revalidate(teamId);
  return r;
}

export async function deleteServiceConnection(teamId: string, id: string): Promise<{ error: string } | void> {
  await requireMember(teamId);
  await prisma.serviceConnection.deleteMany({ where: { id, teamId } });
  await revalidate(teamId);
}
