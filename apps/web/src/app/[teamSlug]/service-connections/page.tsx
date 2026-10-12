import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { publicServiceConfig } from "@/lib/server/serviceConnections";
import { describeServiceConnection } from "@/lib/server/serviceTools";
import {
  connectionState,
  requestedSelection,
  type Selection,
} from "@/lib/isomorphic/serviceConnectionTypes";
import { ServiceConnectionsTable, type ServiceConnectionRow } from "./ServiceConnectionsTable";

export default async function ServiceConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { teamSlug } = await params;
  const { connected, error } = await searchParams;
  const team = await requireTeam(teamSlug);

  const rows = await prisma.serviceConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { scopes: true } } },
  });

  // Tokens never leave the server; only the plain config does.
  const connections: ServiceConnectionRow[] = rows.map((r) => {
    const config = publicServiceConfig(r);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type,
      selection: requestedSelection(r.type, config),
      granted: (config.granted as Selection | undefined) ?? null,
      description: describeServiceConnection(r),
      state: connectionState(r.type, config),
      lastTestOk: r.lastTestOk,
      lastTestError: r.lastTestError,
      lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
      bundles: r._count.scopes,
    };
  });

  return <ServiceConnectionsTable connections={connections} flash={{ connected, error }} />;
}
