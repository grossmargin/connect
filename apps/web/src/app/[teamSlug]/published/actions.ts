"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { slugify } from "@/lib/slug";
import { isTeamSubroute } from "@/lib/reservedSlugs";

async function requireMember(teamId: string): Promise<boolean> {
  const user = await requireUser();
  return !!teamId && (await userInTeam(user.id, teamId));
}

// Keep only toolset ids that belong to this team.
async function teamToolsetIds(teamId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.mcpToolset.findMany({
    where: { teamId, id: { in: ids } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function revalidate(teamId: string) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (t) revalidatePath(`/${t.slug}/published`);
}

// A named published scope. The slug is its path segment under /[teamSlug].
export async function createScope(
  teamId: string,
  name: string,
  rawSlug: string,
): Promise<{ error: string } | { id: string }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };

  const slug = slugify(rawSlug || trimmed);
  if (isTeamSubroute(slug)) return { error: `"${slug}" is reserved.` };

  try {
    const scope = await prisma.mcpScope.create({
      data: { teamId, name: trimmed, slug, isDefault: false },
    });
    await revalidate(teamId);
    return { id: scope.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `"${slug}" is already in use.` };
    }
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// Update a scope's published toolsets, and (for named scopes) its name/slug.
export async function updateScope(
  teamId: string,
  scopeId: string,
  name: string,
  rawSlug: string,
  toolsetIds: string[],
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };

  const scope = await prisma.mcpScope.findUnique({
    where: { id: scopeId },
    select: { teamId: true, isDefault: true },
  });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };

  const ids = await teamToolsetIds(teamId, toolsetIds);
  const data: Prisma.McpScopeUpdateInput = {
    toolsets: { set: ids.map((id) => ({ id })) },
  };

  // The default scope's name/slug are fixed (it is the team root).
  if (!scope.isDefault) {
    const trimmed = name.trim();
    if (!trimmed) return { error: "Name is required." };
    const slug = slugify(rawSlug || trimmed);
    if (isTeamSubroute(slug)) return { error: `"${slug}" is reserved.` };
    data.name = trimmed;
    data.slug = slug;
  }

  try {
    await prisma.mcpScope.update({ where: { id: scopeId }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That id is already in use." };
    }
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
  await revalidate(teamId);
  return { ok: true };
}

export async function deleteScope(
  teamId: string,
  scopeId: string,
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };

  const scope = await prisma.mcpScope.findUnique({
    where: { id: scopeId },
    select: { teamId: true, isDefault: true },
  });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };
  if (scope.isDefault) return { error: "The default scope can't be deleted." };

  await prisma.mcpScope.delete({ where: { id: scopeId } });
  await revalidate(teamId);
  return { ok: true };
}
