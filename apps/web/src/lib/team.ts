import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";

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
