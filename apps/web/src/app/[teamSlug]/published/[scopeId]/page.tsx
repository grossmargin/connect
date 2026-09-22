import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { EditPublished, type ConnOption, type GroupData, type VaultOption } from "./EditPublished";

export default async function EditPublishedMcpPage({
  params,
}: {
  params: Promise<{ teamSlug: string; scopeId: string }>;
}) {
  const { teamSlug, scopeId } = await params;
  const team = await requireTeam(teamSlug);

  const scope = await prisma.mcpScope.findUnique({
    where: { id: scopeId },
    include: {
      connections: { select: { id: true } },
      groups: {
        orderBy: { name: "asc" },
        include: { tenants: { select: { id: true } } },
      },
      vaults: { select: { id: true } },
    },
  });
  if (!scope || scope.teamId !== team.id) notFound();

  const allConnections = await prisma.mcpConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const allVaults = await prisma.vault.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const groups: GroupData[] = scope.groups.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    tenantIds: g.tenants.map((t) => t.id),
  }));

  return (
    <EditPublished
      scope={{ id: scope.id, name: scope.name, slug: scope.slug, isDefault: scope.isDefault }}
      memberConnectionIds={scope.connections.map((c) => c.id)}
      groups={groups}
      allConnections={allConnections as ConnOption[]}
      allVaults={allVaults as VaultOption[]}
      vaultMode={scope.vaultMode === "LIST" ? "LIST" : "ALL"}
      selectedVaultIds={scope.vaults.map((v) => v.id)}
    />
  );
}
