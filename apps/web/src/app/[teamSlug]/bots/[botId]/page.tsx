import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { isUuid } from "@/lib/isomorphic/ids";
import { requireTeam } from "@/lib/server/team";
import { botToken, webhookUrl } from "@/lib/server/bots";
import { telegramCall } from "@/lib/server/telegram";
import { botStatus } from "../status";
import { BotView, type ChatRow, type MessageRow } from "./BotView";

const MESSAGE_LIMIT = 200;

export default async function BotPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamSlug: string; botId: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const { teamSlug, botId } = await params;
  const { chat } = await searchParams;
  if (!isUuid(botId)) notFound();
  const team = await requireTeam(teamSlug);

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.teamId !== team.id) notFound();

  const [counts, latest] = await Promise.all([
    prisma.botMessage.groupBy({ by: ["chatId"], where: { botId }, _count: true, _max: { sentAt: true } }),
    // Latest title and type per chat.
    prisma.botMessage.findMany({
      where: { botId },
      distinct: ["chatId"],
      orderBy: [{ chatId: "asc" }, { sentAt: "desc" }],
      select: { chatId: true, chatTitle: true, chatType: true },
    }),
  ]);
  const meta = new Map(latest.map((l) => [l.chatId, l]));
  const chats: ChatRow[] = counts
    .map((c) => ({
      chatId: c.chatId,
      title: meta.get(c.chatId)?.chatTitle ?? c.chatId,
      type: meta.get(c.chatId)?.chatType ?? null,
      messages: c._count,
      lastAt: c._max.sentAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  const chatId = chat && meta.has(chat) ? chat : chats[0]?.chatId;
  const rows = chatId
    ? await prisma.botMessage.findMany({
        where: { botId, chatId },
        orderBy: { sentAt: "desc" },
        take: MESSAGE_LIMIT,
        select: {
          id: true,
          senderName: true,
          text: true,
          sentAt: true,
          editedAt: true,
          attachments: { select: { id: true, kind: true, fileName: true, size: true, error: true } },
        },
      })
    : [];
  const messages: MessageRow[] = rows.map((m) => ({
    ...m,
    sentAt: m.sentAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
  }));

  // Live webhook state from Telegram; shown as-is, not stored.
  let webhook: { url: string; pending: number; lastError: string | null } | null = null;
  try {
    const info = await telegramCall<{ url: string; pending_update_count: number; last_error_message?: string }>(
      botToken(bot),
      "getWebhookInfo",
    );
    webhook = { url: info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null };
  } catch {
    // Token revoked or Telegram unreachable: the page still renders.
  }

  return (
    <BotView
      bot={{
        id: bot.id,
        name: bot.name,
        username: bot.username,
        status: botStatus(bot),
        lastError: bot.lastError,
        expectedWebhookUrl: webhookUrl(bot.id),
      }}
      webhook={webhook}
      chats={chats}
      chatId={chatId ?? null}
      messages={messages}
      limit={MESSAGE_LIMIT}
    />
  );
}
