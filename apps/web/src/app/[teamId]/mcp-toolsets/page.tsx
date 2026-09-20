import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { ToolsetsTable, type ToolsetRow, type ConnectionOption } from "./ToolsetsTable";

export default async function McpToolsetsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

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

  return <ToolsetsTable teamId={teamId} toolsets={rows} connections={connections as ConnectionOption[]} />;
}
