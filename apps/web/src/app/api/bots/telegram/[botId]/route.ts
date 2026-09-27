import { prisma } from "@/lib/server/db";
import { isUuid } from "@/lib/isomorphic/ids";
import { ingestTelegramUpdate, verifyWebhookSecret } from "@/lib/server/bots";

export const dynamic = "force-dynamic";
// Attachment downloads run inside the request.
export const maxDuration = 60;

// Telegram webhook. Authenticated by the secret set in setWebhook. A non-2xx
// reply makes Telegram retry the update.
export async function POST(req: Request, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;
  if (!isUuid(botId)) return new Response("not found", { status: 404 });

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.platform !== "telegram") return new Response("not found", { status: 404 });
  if (!verifyWebhookSecret(bot, req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  await ingestTelegramUpdate(bot, update);
  return Response.json({ ok: true });
}
