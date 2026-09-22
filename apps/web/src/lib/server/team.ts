import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { isUuid } from "@/lib/isomorphic/ids";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";

// Resolved team, as pages and MCP mounts need it: the uuid for DB queries and
// the slug for URLs.
export type ResolvedTeam = { id: string; name: string; slug: string };

// The team addressed by a URL segment, which may be the slug (the public id) or
// the uuid — the uuid is accepted so old links (and the uuid backfill) keep
// working. Slugs are `[A-Za-z0-9_]` so they can never look like a uuid.
export async function getTeamByIdOrSlug(idOrSlug: string): Promise<ResolvedTeam | null> {
  return prisma.team.findFirst({
    where: isUuid(idOrSlug) ? { OR: [{ slug: idOrSlug }, { id: idOrSlug }] } : { slug: idOrSlug },
    select: { id: true, name: true, slug: true },
  });
}

// Page guard: resolve the id/slug, require a signed-in member, or 404. Returns
// the team so the caller can query by team.id.
export async function requireTeam(idOrSlug: string): Promise<ResolvedTeam> {
  const team = await getTeamByIdOrSlug(idOrSlug);
  if (!team) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, team.id))) notFound();
  return team;
}
