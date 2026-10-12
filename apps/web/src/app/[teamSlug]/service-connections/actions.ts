"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { slugify } from "@/lib/isomorphic/slug";
import {
  connectionState,
  selectionIsEmpty,
  serviceTypeDef,
  type Selection,
} from "@/lib/isomorphic/serviceConnectionTypes";
import { packServiceConfig, publicServiceConfig, updateServiceConfig } from "@/lib/server/serviceConnections";
import { testServiceConnection, type ServiceTestResult } from "@/lib/server/serviceOAuth";

type Input = { name: string; slug?: string; selection: Selection };

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

async function revalidate(teamId: string) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (t) revalidatePath(`/${t.slug}/service-connections`);
}

function selectionField(type: string): "products" | "scopes" {
  return type === "quickbooks" ? "products" : "scopes";
}

function validate(type: string, input: Input): string | null {
  if (!serviceTypeDef(type)) return `Unknown service type "${type}".`;
  if (!input.name.trim()) return "Name is required.";
  if (selectionIsEmpty(type, input.selection)) return "Pick at least one thing to connect.";
  return null;
}

function saveError(e: unknown): { error: string } {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { error: "Another service connection already uses this id." };
  }
  return { error: e instanceof Error ? e.message : "Unexpected error" };
}

// Saves the connection without tokens. The client then opens
// /api/service-connections/<id>/connect to run the consent flow.
export async function createServiceConnection(
  teamId: string,
  type: string,
  input: Input,
): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const invalid = validate(type, input);
  if (invalid) return { error: invalid };
  const packed = packServiceConfig(type, { [selectionField(type)]: input.selection });
  if ("error" in packed) return packed;

  try {
    const conn = await prisma.serviceConnection.create({
      data: {
        teamId,
        type,
        name: input.name.trim(),
        slug: slugify(input.slug?.trim() || input.name),
        config: packed.config,
        secrets: packed.secrets,
        createdById: user.id,
      },
    });
    await revalidate(teamId);
    return { id: conn.id };
  } catch (e) {
    return saveError(e);
  }
}

// Changing the selection keeps the current tokens; the connection then shows
// "Needs reconnect" until the user grants the new scopes.
export async function updateServiceConnection(
  teamId: string,
  id: string,
  input: Input,
): Promise<{ needsReconnect: boolean } | { error: string }> {
  await requireMember(teamId);
  const prev = await prisma.serviceConnection.findFirst({ where: { id, teamId } });
  if (!prev) return { error: "not found" };
  const invalid = validate(prev.type, input);
  if (invalid) return { error: invalid };

  try {
    let conn = await prisma.serviceConnection.update({
      where: { id },
      data: { name: input.name.trim(), slug: slugify(input.slug?.trim() || input.name) },
    });
    conn = await updateServiceConfig(conn, { [selectionField(prev.type)]: input.selection });
    await revalidate(teamId);
    return { needsReconnect: connectionState(conn.type, publicServiceConfig(conn)) !== "CONNECTED" };
  } catch (e) {
    return saveError(e);
  }
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
