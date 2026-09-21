import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";

// Resolved team, as pages and MCP mounts need it: the uuid for DB queries and
// the slug for URLs.
export type ResolvedTeam = { id: string; name: string; slug: string };

// The team addressed by a URL segment. Slugs are the public id; the uuid is
// still accepted so old links (and the uuid backfill) keep working.
export async function getTeamBySlug(slug: string): Promise<ResolvedTeam | null> {
  return prisma.team.findFirst({
    where: isUuid(slug) ? { OR: [{ slug }, { id: slug }] } : { slug },
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
