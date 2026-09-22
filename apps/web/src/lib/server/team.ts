import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";

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
