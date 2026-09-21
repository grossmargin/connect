import { prisma } from "@/lib/db";
import { requireTeam } from "@/lib/team";
import { ToolsetsTable, type ToolsetRow, type ConnectionOption } from "./ToolsetsTable";

export default async function McpToolsetsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);
  const teamId = team.id;

  const [toolsets, connections] = await Promise.all([
    prisma.mcpToolset.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        lastTestOk: true,
        lastTestedAt: true,
        _count: { select: { connections: true } },
      },
    }),
    prisma.mcpConnection.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: ToolsetRow[] = toolsets.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    connectionCount: t._count.connections,
    lastTestOk: t.lastTestOk,
    lastTestedAt: t.lastTestedAt?.toISOString() ?? null,
  }));

  return <ToolsetsTable toolsets={rows} connections={connections as ConnectionOption[]} />;
}
