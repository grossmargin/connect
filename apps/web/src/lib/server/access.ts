import { prisma } from "@/lib/server/db";

// Team-level access: a user sees everything in teams they belong to.

export async function userTeamIds(userId: string): Promise<string[]> {
  const rows = await prisma.teamMembership.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}

export async function userCanAccessVault(userId: string, vaultId: string): Promise<boolean> {
  const vault = await prisma.vault.findUnique({ where: { id: vaultId }, select: { teamId: true } });
  if (!vault) return false;
  return userInTeam(userId, vault.teamId);
}

export async function userInTeam(userId: string, teamId: string): Promise<boolean> {
  const m = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { id: true },
  });
  return !!m;
}

// Roles that may see admin-only surfaces (e.g. Team Stats). The role column is a
// free-form string defaulting to ADMIN, so members created so far are admins.
const ADMIN_ROLES = new Set(["ADMIN", "OWNER"]);

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role.toUpperCase());
}

export async function userIsTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  const m = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
  return isAdminRole(m?.role);
}
