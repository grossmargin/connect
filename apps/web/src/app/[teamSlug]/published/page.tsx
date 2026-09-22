import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { getOrCreateDefaultScope } from "@/lib/server/scopes";
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
      connections: { select: { slug: true }, orderBy: { slug: "asc" } },
      groups: {
        orderBy: { slug: "asc" },
        select: { slug: true, tenants: { select: { slug: true }, orderBy: { slug: "asc" } } },
      },
    },
  });

  const rows: ScopeRow[] = scopes.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    isDefault: s.isDefault,
    connections: s.connections.map((c) => c.slug),
    groups: s.groups.map((g) => ({ slug: g.slug, tenants: g.tenants.map((t) => t.slug) })),
  }));

  return <PublishedList scopes={rows} />;
}
