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

// Keep only connection ids that belong to this team.
async function teamConnectionIds(teamId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.mcpConnection.findMany({
    where: { teamId, id: { in: ids } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function revalidate(teamId: string) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (t) revalidatePath(`/${t.slug}/published`);
}

// The tool prefixes already used inside one Published MCP: every individual
// connection's slug plus every group's slug. `exceptGroupId` excludes a group
// being edited. Used to keep prefixes unique across members.
async function usedPrefixes(scopeId: string, exceptGroupId?: string): Promise<Set<string>> {
  const scope = await prisma.mcpScope.findUnique({
    where: { id: scopeId },
    include: {
      connections: { select: { slug: true } },
      groups: { select: { id: true, slug: true } },
    },
  });
  const set = new Set<string>();
  if (!scope) return set;
  for (const c of scope.connections) set.add(c.slug);
  for (const g of scope.groups) if (g.id !== exceptGroupId) set.add(g.slug);
  return set;
}

// ---------- Published MCP (scope) ----------

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

// Update a named Published MCP's name/slug. The default one's are fixed. Members
// (individual connections and groups) are managed separately.
export async function updateScope(
  teamId: string,
  scopeId: string,
  name: string,
  rawSlug: string,
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };

  const scope = await prisma.mcpScope.findUnique({
    where: { id: scopeId },
    select: { teamId: true, isDefault: true },
  });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };
  if (scope.isDefault) return { error: "The default Published MCP's id is fixed." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const slug = slugify(rawSlug || trimmed);
  if (isTeamSubroute(slug)) return { error: `"${slug}" is reserved.` };

  try {
    await prisma.mcpScope.update({ where: { id: scopeId }, data: { name: trimmed, slug } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That id is already in use." };
    }
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
  await revalidate(teamId);
  return { ok: true };
}

// Publish one or more connections as individual members of a Published MCP. An
// individual member's tool prefix is its connection slug, so it must not collide
// with a group slug (or another member) already here.
export async function addScopeConnections(
  teamId: string,
  scopeId: string,
  connectionIds: string[],
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const scope = await prisma.mcpScope.findUnique({ where: { id: scopeId }, select: { teamId: true } });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };

  const ids = await teamConnectionIds(teamId, connectionIds);
  if (ids.length === 0) return { error: "Pick at least one MCP." };

  const taken = await usedPrefixes(scopeId);
  const chosen = await prisma.mcpConnection.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  const clash = chosen.find((c) => taken.has(c.slug));
  if (clash) return { error: `"${clash.slug}" is already used by another member here.` };

  await prisma.mcpScope.update({
    where: { id: scopeId },
    data: { connections: { connect: ids.map((id) => ({ id })) } },
  });
  await revalidate(teamId);
  return { ok: true };
}

export async function removeScopeConnection(
  teamId: string,
  scopeId: string,
  connectionId: string,
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const scope = await prisma.mcpScope.findUnique({ where: { id: scopeId }, select: { teamId: true } });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };

  await prisma.mcpScope.update({
    where: { id: scopeId },
    data: { connections: { disconnect: { id: connectionId } } },
  });
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
  if (scope.isDefault) return { error: "The default Published MCP can't be deleted." };

  await prisma.mcpScope.delete({ where: { id: scopeId } });
  await revalidate(teamId);
  return { ok: true };
}

// ---------- groups (tenanted members) ----------

export async function createGroup(
  teamId: string,
  scopeId: string,
  name: string,
  rawSlug: string,
  tenantIds: string[],
): Promise<{ error: string } | { id: string }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const scope = await prisma.mcpScope.findUnique({ where: { id: scopeId }, select: { teamId: true } });
  if (!scope || scope.teamId !== teamId) return { error: "not found" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const slug = slugify(rawSlug || trimmed);
  if ((await usedPrefixes(scopeId)).has(slug)) {
    return { error: `"${slug}" is already used by another member here.` };
  }
  const ids = await teamConnectionIds(teamId, tenantIds);

  try {
    const group = await prisma.mcpGroup.create({
      data: { teamId, scopeId, name: trimmed, slug, tenants: { connect: ids.map((id) => ({ id })) } },
    });
    await revalidate(teamId);
    return { id: group.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `"${slug}" is already in use.` };
    }
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function updateGroup(
  teamId: string,
  groupId: string,
  name: string,
  rawSlug: string,
  tenantIds: string[],
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const group = await prisma.mcpGroup.findUnique({
    where: { id: groupId },
    select: { teamId: true, scopeId: true },
  });
  if (!group || group.teamId !== teamId) return { error: "not found" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const slug = slugify(rawSlug || trimmed);
  if ((await usedPrefixes(group.scopeId, groupId)).has(slug)) {
    return { error: `"${slug}" is already used by another member here.` };
  }
  const ids = await teamConnectionIds(teamId, tenantIds);

  try {
    await prisma.mcpGroup.update({
      where: { id: groupId },
      data: { name: trimmed, slug, tenants: { set: ids.map((id) => ({ id })) } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `"${slug}" is already in use.` };
    }
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
  await revalidate(teamId);
  return { ok: true };
}

export async function deleteGroup(
  teamId: string,
  groupId: string,
): Promise<{ error: string } | { ok: true }> {
  if (!(await requireMember(teamId))) return { error: "not found" };
  const group = await prisma.mcpGroup.findUnique({ where: { id: groupId }, select: { teamId: true } });
  if (!group || group.teamId !== teamId) return { error: "not found" };

  await prisma.mcpGroup.delete({ where: { id: groupId } });
  await revalidate(teamId);
  return { ok: true };
}
