import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { isUuid } from "@/lib/isomorphic/ids";
import { requireTeam } from "@/lib/server/team";
import { EditAgent, type BotOption } from "./EditAgent";

export default async function AgentPage({ params }: { params: Promise<{ teamSlug: string; agentId: string }> }) {
  const { teamSlug, agentId } = await params;
  if (!isUuid(agentId)) notFound();
  const team = await requireTeam(teamSlug);

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { bots: { select: { botId: true, context: true } }, scopes: { select: { id: true } } },
  });
  if (!agent || agent.teamId !== team.id) notFound();

  const [bots, scopes] = await Promise.all([
    prisma.bot.findMany({
      where: { teamId: team.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, platform: true },
    }),
    prisma.mcpScope.findMany({ where: { teamId: team.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <EditAgent
      agent={{
        id: agent.id,
        name: agent.name,
        systemPromptUrl: agent.systemPromptUrl ?? "",
        scopeIds: agent.scopes.map((s) => s.id),
        bots: agent.bots.map((b) => ({ botId: b.botId, context: b.context as Record<string, unknown> })),
      }}
      allBots={bots as BotOption[]}
      allScopes={scopes}
    />
  );
}
