import { prisma } from "@/lib/db";
import { requireTeam } from "@/lib/team";
import { getOrCreateDefaultScope } from "@/lib/scopes";
import { PublishedList, type ScopeRow } from "./PublishedList";

export default async function PublishedMcpsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  // Ensure the default Published MCP exists (served at the team root).
  await getOrCreateDefaultScope(team.id);

  const scopes = await prisma.mcpScope.findMany({
    where: { teamId: team.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { connections: true, groups: true } },
    },
  });

  const rows: ScopeRow[] = scopes.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    isDefault: s.isDefault,
    connectionCount: s._count.connections,
    groupCount: s._count.groups,
  }));

  return <PublishedList scopes={rows} />;
}
