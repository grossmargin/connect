import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { ConnectionsTable, type ConnectionRow } from "./ConnectionsTable";

export default async function McpConnectionsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const rows = await prisma.mcpConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      url: true,
      lastTestedAt: true,
      lastConnectedAt: true,
    },
  });

  const connections: ConnectionRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status as ConnectionRow["status"],
    url: r.url,
    lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
    lastConnectedAt: r.lastConnectedAt?.toISOString() ?? null,
  }));

  return <ConnectionsTable connections={connections} />;
}
