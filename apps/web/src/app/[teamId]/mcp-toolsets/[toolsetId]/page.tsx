import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { EditToolset } from "./EditToolset";
import type { ConnectionOption } from "../ToolsetsTable";

export default async function ToolsetDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; toolsetId: string }>;
}) {
  const { teamId, toolsetId } = await params;
  if (!isUuid(teamId) || !isUuid(toolsetId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

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
      teamId={teamId}
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
