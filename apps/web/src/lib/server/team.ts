import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam, userIsTeamAdmin } from "@/lib/server/access";
import { slugify } from "@/lib/isomorphic/slug";
import { isReservedSlug } from "@/lib/isomorphic/reservedSlugs";
import { getDefaultTeamId } from "@/lib/server/userSettings";

// Resolved team, as pages and MCP mounts need it: the uuid for DB queries and
// the slug for URLs.
export type ResolvedTeam = { id: string; name: string; slug: string };

// The team addressed by a URL segment. Resolved by slug only — a raw team id is
// not an addressing scheme, so one team can't be reached by another's id.
// Teams that never set a custom slug were backfilled with slug === their uuid,
// so those still resolve by that value (it is their slug).
export async function getTeamBySlug(slug: string): Promise<ResolvedTeam | null> {
  return prisma.team.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
}

// Page guard: resolve the slug, require a signed-in member, or 404. Returns the
// team so the caller can query by team.id.
export async function requireTeam(slug: string): Promise<ResolvedTeam> {
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, team.id))) notFound();
  return team;
}

// Page guard for admin-only surfaces: like requireTeam, but 404s a member who
// is not a team admin so the page is indistinguishable from not existing.
export async function requireTeamAdmin(slug: string): Promise<ResolvedTeam> {
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const user = await requireUser();
  if (!(await userIsTeamAdmin(user.id, team.id))) notFound();
  return team;
}

// Teams the user belongs to, oldest team first (by team creation date).
export async function userTeams(userId: string): Promise<ResolvedTeam[]> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId },
    include: { team: { select: { id: true, name: true, slug: true } } },
  });
  return memberships
    .map((m) => m.team)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The team a user's root MCP mount and post-login redirect resolve to: the
// chosen default team, else the oldest team by creation date. Null if none.
export async function resolveUserTeamId(userId: string): Promise<string | null> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId },
    include: { team: { select: { id: true, createdAt: true } } },
  });
  if (memberships.length === 0) return null;

  const defaultId = await getDefaultTeamId(userId);
  if (defaultId && memberships.some((m) => m.teamId === defaultId)) return defaultId;

  const oldest = memberships
    .map((m) => m.team)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return oldest.id;
}

// Create a team owned by `userId`. Derives a unique slug from the name. Returns
// the new team's slug.
export async function createTeam(userId: string, rawName: string): Promise<ResolvedTeam> {
  const name = rawName.trim();
  if (!name) throw new Error("Name is required.");
  const slug = await uniqueTeamSlug(name);

  const team = await prisma.team.create({
    data: {
      name,
      slug,
      memberships: { create: { userId, role: "OWNER" } },
    },
    select: { id: true, name: true, slug: true },
  });
  return team;
}

// A team slug free of collisions and reserved words, derived from the name.
async function uniqueTeamSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}_${i + 1}`;
    if (isReservedSlug(candidate)) continue;
    const clash = await prisma.team.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  // Fall back to a random suffix if the name is heavily contested.
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}
