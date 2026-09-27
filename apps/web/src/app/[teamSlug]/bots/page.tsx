import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { BotsTable, type BotRow } from "./BotsTable";
import { botStatus } from "./status";

export default async function BotsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const rows = await prisma.bot.findMany({
    where: { teamId: team.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      platform: true,
      username: true,
      webhookSecretHash: true,
      lastError: true,
      lastMessageAt: true,
      _count: { select: { messages: true } },
    },
  });

  const bots: BotRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    platform: r.platform,
    username: r.username,
    status: botStatus(r),
    messages: r._count.messages,
    lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
  }));

  return <BotsTable bots={bots} />;
}
