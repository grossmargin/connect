"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { encryptContent } from "@/lib/server/crypto";
import { botToken, connectWebhook } from "@/lib/server/bots";
import { telegramCall, type TelegramBotInfo } from "@/lib/server/telegram";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

// Checks the token with getMe, saves the bot and registers its webhook. The bot
// is kept when the webhook fails (e.g. APP_URL is not public); retry with
// reconnectBot. `warning` is set when privacy mode hides group messages.
export async function createBot(
  teamId: string,
  name: string,
  token: string,
): Promise<{ id: string; warning?: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmedToken = token.trim();
  if (!trimmedToken) return { error: "Token is required." };

  let me: TelegramBotInfo;
  try {
    me = await telegramCall<TelegramBotInfo>(trimmedToken, "getMe");
  } catch (e) {
    return { error: `Token check failed: ${errorMessage(e)}` };
  }

  let bot;
  try {
    bot = await prisma.bot.create({
      data: {
        teamId,
        platform: "telegram",
        name: name.trim() || me.first_name,
        externalId: String(me.id),
        username: me.username ?? null,
        encryptedToken: encryptContent({ value: trimmedToken }),
        createdById: user.id,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "This bot is already added." };
    }
    return { error: errorMessage(e) };
  }

  const warnings: string[] = [];
  if (!me.can_read_all_group_messages) {
    warnings.push("Privacy mode is on: in groups the bot sees only commands and mentions. Disable it in @BotFather (/setprivacy), then re-add the bot to groups.");
  }
  try {
    await connectWebhook(bot);
  } catch (e) {
    warnings.push(`Webhook not set: ${errorMessage(e)}`);
  }
  return { id: bot.id, ...(warnings.length ? { warning: warnings.join(" ") } : {}) };
}

export async function reconnectBot(teamId: string, botId: string): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const bot = await prisma.bot.findFirst({ where: { id: botId, teamId } });
  if (!bot) return { error: "not found" };
  try {
    await connectWebhook(bot);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Removes the webhook, then the bot and all its saved messages.
export async function deleteBot(teamId: string, botId: string): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const bot = await prisma.bot.findFirst({ where: { id: botId, teamId } });
  if (!bot) return;
  try {
    await telegramCall(botToken(bot), "deleteWebhook");
  } catch {
    // A revoked token can't delete its webhook; delete the bot anyway.
  }
  await prisma.bot.delete({ where: { id: bot.id } });
}
