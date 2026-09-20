import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { EditConnection } from "./EditConnection";
import type { ConnectionStatus } from "../status";

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; connectionId: string }>;
}) {
  const { teamId, connectionId } = await params;
  if (!isUuid(teamId) || !isUuid(connectionId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

  const conn = await prisma.mcpConnection.findUnique({
    where: { id: connectionId },
    include: { toolsets: { select: { id: true, name: true, slug: true } } },
  });
  if (!conn || conn.teamId !== teamId) notFound();

  return (
    <EditConnection
      teamId={teamId}
      connection={{
        id: conn.id,
        name: conn.name,
        slug: conn.slug,
        url: conn.url,
        authType: conn.authType,
        status: conn.status as ConnectionStatus,
        lastError: conn.lastError,
        lastConnectedAt: conn.lastConnectedAt?.toISOString() ?? null,
        lastTestedAt: conn.lastTestedAt?.toISOString() ?? null,
        toolsets: conn.toolsets,
      }}
    />
  );
}
