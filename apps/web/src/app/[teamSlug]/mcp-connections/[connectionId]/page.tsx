import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireTeam } from "@/lib/team";
import { EditConnection } from "./EditConnection";
import type { ConnectionStatus } from "../status";

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ teamSlug: string; connectionId: string }>;
}) {
  const { teamSlug, connectionId } = await params;
  if (!isUuid(connectionId)) notFound();
  const team = await requireTeam(teamSlug);

  const conn = await prisma.mcpConnection.findUnique({
    where: { id: connectionId },
    include: { toolsets: { select: { id: true, name: true, slug: true } } },
  });
  if (!conn || conn.teamId !== team.id) notFound();

  return (
    <EditConnection
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
