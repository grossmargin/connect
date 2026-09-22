"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { slugify } from "@/lib/isomorphic/slug";
import { isReservedSlug } from "@/lib/isomorphic/reservedSlugs";
import { generateServiceAccountKey } from "@/lib/server/tokens";

// Change a team's slug (its public id and per-team MCP mount). Returns the
// normalized slug on success so the client can navigate to the new URL.
export async function updateTeamSlug(
  teamId: string,
  raw: string,
): Promise<{ error: string } | { slug: string }> {
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) return { error: "not found" };

  const slug = slugify(raw);
  if (!slug) return { error: "Enter a valid id (letters, digits, underscore)." };
  if (isReservedSlug(slug)) return { error: `"${slug}" is reserved.` };

  const clash = await prisma.team.findFirst({
    where: { slug, NOT: { id: teamId } },
    select: { id: true },
  });
  if (clash) return { error: `"${slug}" is already taken.` };

  await prisma.team.update({ where: { id: teamId }, data: { slug } });
  revalidatePath(`/${slug}/settings`);
  return { slug };
}

// ---------- Service accounts ----------
//
// Team-scoped machine identities. A key's raw token (sa_…) is shown once, here,
// and only its hash is stored. These power the Team Settings editor.

async function assertTeamMember(teamId: string): Promise<string | null> {
  const user = await requireUser();
  if (!teamId || !(await userInTeam(user.id, teamId))) return null;
  return user.id;
}

// Load the team's slug so a mutation can revalidate the settings page.
async function teamSlug(teamId: string): Promise<string | null> {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  return t?.slug ?? null;
}

export async function createServiceAccount(
  teamId: string,
  rawName: string,
): Promise<{ error: string } | { id: string; key: string }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };
  const name = rawName.trim();
  if (!name) return { error: "Enter a name." };

  const sa = await prisma.serviceAccount.create({ data: { teamId, name, createdById: userId } });
  const k = generateServiceAccountKey();
  await prisma.serviceAccountKey.create({
    data: { serviceAccountId: sa.id, hash: k.hash, hint: k.hint },
  });

  const slug = await teamSlug(teamId);
  if (slug) revalidatePath(`/${slug}/settings`);
  return { id: sa.id, key: k.raw };
}

export async function renameServiceAccount(
  teamId: string,
  serviceAccountId: string,
  rawName: string,
): Promise<{ error: string } | { ok: true }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };
  const name = rawName.trim();
  if (!name) return { error: "Enter a name." };

  const sa = await prisma.serviceAccount.findUnique({
    where: { id: serviceAccountId },
    select: { teamId: true },
  });
  if (!sa || sa.teamId !== teamId) return { error: "not found" };

  await prisma.serviceAccount.update({ where: { id: serviceAccountId }, data: { name } });
  const slug = await teamSlug(teamId);
  if (slug) revalidatePath(`/${slug}/settings`);
  return { ok: true };
}

export async function deleteServiceAccount(
  teamId: string,
  serviceAccountId: string,
): Promise<{ error: string } | { ok: true }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };

  const sa = await prisma.serviceAccount.findUnique({
    where: { id: serviceAccountId },
    select: { teamId: true },
  });
  if (!sa || sa.teamId !== teamId) return { error: "not found" };

  // Keys cascade-delete with the account.
  await prisma.serviceAccount.delete({ where: { id: serviceAccountId } });
  const slug = await teamSlug(teamId);
  if (slug) revalidatePath(`/${slug}/settings`);
  return { ok: true };
}

export type ServiceAccountKeyInfo = {
  id: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
};

// Only active keys — a revoke is a soft-delete, so revoked keys are hidden.
export async function listServiceAccountKeys(
  teamId: string,
  serviceAccountId: string,
): Promise<{ error: string } | { keys: ServiceAccountKeyInfo[] }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };

  const sa = await prisma.serviceAccount.findUnique({
    where: { id: serviceAccountId },
    select: { teamId: true },
  });
  if (!sa || sa.teamId !== teamId) return { error: "not found" };

  const keys = await prisma.serviceAccountKey.findMany({
    where: { serviceAccountId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, hint: true, createdAt: true, lastUsedAt: true },
  });

  return {
    keys: keys.map((k) => ({
      id: k.id,
      hint: k.hint,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

export async function addServiceAccountKey(
  teamId: string,
  serviceAccountId: string,
): Promise<{ error: string } | { key: string }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };

  const sa = await prisma.serviceAccount.findUnique({
    where: { id: serviceAccountId },
    select: { teamId: true },
  });
  if (!sa || sa.teamId !== teamId) return { error: "not found" };

  const k = generateServiceAccountKey();
  await prisma.serviceAccountKey.create({
    data: { serviceAccountId, hash: k.hash, hint: k.hint },
  });
  const slug = await teamSlug(teamId);
  if (slug) revalidatePath(`/${slug}/settings`);
  return { key: k.raw };
}

export async function revokeServiceAccountKey(
  teamId: string,
  keyId: string,
): Promise<{ error: string } | { ok: true }> {
  const userId = await assertTeamMember(teamId);
  if (!userId) return { error: "not found" };

  const key = await prisma.serviceAccountKey.findUnique({
    where: { id: keyId },
    include: { serviceAccount: { select: { teamId: true } } },
  });
  if (!key || key.serviceAccount.teamId !== teamId) return { error: "not found" };

  await prisma.serviceAccountKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  const slug = await teamSlug(teamId);
  if (slug) revalidatePath(`/${slug}/settings`);
  return { ok: true };
}
