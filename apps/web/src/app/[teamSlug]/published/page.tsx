import { prisma } from "@/lib/db";
import { requireTeam } from "@/lib/team";
import { getOrCreateDefaultScope } from "@/lib/scopes";
import { PublishedList, type ScopeRow, type ToolsetOption } from "./PublishedList";

export default async function PublishedMcpsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  // Ensure the default scope exists (created with all current toolsets attached).
  await getOrCreateDefaultScope(team.id);

  const [scopes, toolsets] = await Promise.all([
    prisma.mcpScope.findMany({
      where: { teamId: team.id },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { toolsets: { select: { id: true } } },
    }),
    prisma.mcpToolset.findMany({
      where: { teamId: team.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: ScopeRow[] = scopes.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    isDefault: s.isDefault,
    toolsetIds: s.toolsets.map((t) => t.id),
  }));

  return <PublishedList scopes={rows} toolsets={toolsets as ToolsetOption[]} />;
}
