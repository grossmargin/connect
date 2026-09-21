import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { ConnectionsTable, type ConnectionRow } from "./ConnectionsTable";

export default async function McpConnectionsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

  const rows = await prisma.mcpConnection.findMany({
    where: { teamId },
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

  return <ConnectionsTable teamId={teamId} connections={connections} />;
}
