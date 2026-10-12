import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { publicServiceConfig } from "@/lib/server/serviceConnections";
import { ServiceConnectionsTable, type ServiceConnectionRow } from "./ServiceConnectionsTable";

export default async function ServiceConnectionsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const rows = await prisma.serviceConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { scopes: true } } },
  });

  // Secrets never leave the server; the form shows them as masked.
  const connections: ServiceConnectionRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    type: r.type,
    config: publicServiceConfig(r),
    hasSecrets: !!r.secrets,
    lastTestOk: r.lastTestOk,
    lastTestError: r.lastTestError,
    lastTestedAt: r.lastTestedAt?.toISOString() ?? null,
    bundles: r._count.scopes,
  }));

  return <ServiceConnectionsTable connections={connections} />;
}
