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
    include: {
      publishedScopes: { select: { id: true, name: true } },
      groups: { select: { id: true, name: true, scope: { select: { id: true, name: true } } } },
    },
  });
  if (!conn || conn.teamId !== team.id) notFound();

  // Where this MCP appears: individually in a Published MCP, or as a tenant in
  // one of its groups. Both link to the Published MCP's edit page.
  const usages = [
    ...conn.publishedScopes.map((s) => ({ scopeId: s.id, label: s.name })),
    ...conn.groups.map((g) => ({ scopeId: g.scope.id, label: `${g.scope.name} · ${g.name} (group)` })),
  ];

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
        usages,
      }}
    />
  );
}
