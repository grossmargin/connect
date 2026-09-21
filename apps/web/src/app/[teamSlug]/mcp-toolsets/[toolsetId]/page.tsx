import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireTeam } from "@/lib/team";
import { EditToolset } from "./EditToolset";
import type { ConnectionOption } from "../ToolsetsTable";

export default async function ToolsetDetailPage({
  params,
}: {
  params: Promise<{ teamSlug: string; toolsetId: string }>;
}) {
  const { teamSlug, toolsetId } = await params;
  if (!isUuid(toolsetId)) notFound();
  const team = await requireTeam(teamSlug);
  const teamId = team.id;

  const [toolset, connections] = await Promise.all([
    prisma.mcpToolset.findUnique({
      where: { id: toolsetId },
      include: { connections: { select: { id: true } } },
    }),
    prisma.mcpConnection.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!toolset || toolset.teamId !== teamId) notFound();

  return (
    <EditToolset
      toolset={{
        id: toolset.id,
        name: toolset.name,
        slug: toolset.slug,
        connectionIds: toolset.connections.map((c) => c.id),
        lastTestOk: toolset.lastTestOk,
        lastTestError: toolset.lastTestError,
        lastTestedAt: toolset.lastTestedAt?.toISOString() ?? null,
        updatedAt: toolset.updatedAt.toISOString(),
      }}
      connections={connections as ConnectionOption[]}
    />
  );
}
