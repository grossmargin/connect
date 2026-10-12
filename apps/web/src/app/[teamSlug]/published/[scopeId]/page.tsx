import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { listStates } from "@/lib/server/stateTools";
import { EditPublished, type BotOption, type ConnOption, type ServiceOption, type GroupData } from "./EditPublished";
import { exposesCredentials } from "@/lib/server/scopes";

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
      bots: { select: { id: true } },
      serviceConnections: { select: { id: true } },
    },
  });
  if (!scope || scope.teamId !== team.id) notFound();

  const allConnections = await prisma.mcpConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const allBots = await prisma.bot.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true },
  });

  const allServiceConnections = await prisma.serviceConnection.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, type: true },
  });

  const states = await listStates(scope.id);

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
      exposeCredentials={exposesCredentials(scope)}
      allBots={allBots as BotOption[]}
      selectedBotIds={scope.bots.map((b) => b.id)}
      allServiceConnections={allServiceConnections as ServiceOption[]}
      selectedServiceConnectionIds={scope.serviceConnections.map((c) => c.id)}
      states={states.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() }))}
    />
  );
}
