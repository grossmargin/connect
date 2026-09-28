import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { AgentsTable, type AgentRow } from "./AgentsTable";

export default async function AgentsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const rows = await prisma.agent.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      systemPromptUrl: true,
      bots: { select: { bot: { select: { name: true } } } },
      scopes: { select: { name: true } },
    },
  });

  const agents: AgentRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    systemPromptUrl: r.systemPromptUrl,
    bots: r.bots.map((b) => b.bot.name),
    bundles: r.scopes.map((s) => s.name),
  }));

  return <AgentsTable agents={agents} />;
}
