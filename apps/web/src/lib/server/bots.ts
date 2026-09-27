import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type Bot } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { decryptContent } from "@/lib/server/crypto";
import { headers } from "next/headers";
import { requestOrigin } from "@/lib/server/serverEnv";
import {
  TELEGRAM_ALLOWED_UPDATES,
  TELEGRAM_MAX_DOWNLOAD_BYTES,
  isAddressedToBot,
  parseUpdate,
  telegramCall,
  telegramDownload,
  type ParsedMessage,
  type TgMessage,
} from "@/lib/server/telegram";

export const BOT_PLATFORMS = ["telegram"] as const;
export type BotPlatform = (typeof BOT_PLATFORMS)[number];

export function botToken(bot: Pick<Bot, "encryptedToken">): string {
  return decryptContent(bot.encryptedToken).value;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Built from the current request's origin: Telegram does not follow redirects,
// so the URL must be the exact https address (see requestOrigin).
export async function webhookUrl(botId: string): Promise<string> {
  const h = await headers();
  return `${requestOrigin((n) => h.get(n))}/api/bots/telegram/${botId}`;
}

// Points the bot's webhook here with a fresh secret. Updates that Telegram
// still holds are kept and delivered.
export async function connectWebhook(bot: Bot): Promise<void> {
  const secret = randomBytes(32).toString("base64url");
  try {
    await telegramCall(botToken(bot), "setWebhook", {
      url: await webhookUrl(bot.id),
      secret_token: secret,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.bot.update({ where: { id: bot.id }, data: { lastError: msg } });
    throw e;
  }
  await prisma.bot.update({
    where: { id: bot.id },
    data: { webhookSecretHash: sha256(secret), lastError: null },
  });
}

export function verifyWebhookSecret(bot: Pick<Bot, "webhookSecretHash">, secret: string | null): boolean {
  if (!bot.webhookSecretHash || !secret) return false;
  const a = Buffer.from(sha256(secret), "hex");
  const b = Buffer.from(bot.webhookSecretHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Reply to a direct message or a message addressed to the bot in a chat.
// `{name}` is the bot's name.
export const MENTION_REPLY =
  "Hey, nice to meet you! I'm {name}. I keep a record of this chat so an AI agent has the context it needs. " +
  "I can't answer questions or act on requests. For that, please message someone on the team directly.";

// Saves the message in an update. The first time the bot sees a message
// addressed to it, it replies once; Telegram retries and edits don't repeat it.
export async function ingestTelegramUpdate(bot: Bot, update: Record<string, unknown>): Promise<void> {
  const m = parseUpdate(update);
  if (!m) return;

  const seen = await prisma.botMessage.findUnique({
    where: { botId_chatId_messageId: { botId: bot.id, chatId: m.chatId, messageId: m.messageId } },
    select: { id: true },
  });
  await saveMessage(bot, m);

  if (!seen && !m.editedAt && isAddressedToBot(m.raw, { id: bot.externalId, username: bot.username })) {
    try {
      await replyToMention(bot, m);
    } catch (e) {
      // The message is saved; a failed reply must not make Telegram retry it.
      console.error(`bot ${bot.id}: reply failed`, e);
    }
  }
}

async function replyToMention(bot: Bot, m: ParsedMessage): Promise<void> {
  const sent = await telegramCall<TgMessage>(botToken(bot), "sendMessage", {
    chat_id: m.chatId,
    text: MENTION_REPLY.replace("{name}", bot.name),
    reply_parameters: { message_id: Number(m.messageId), allow_sending_without_reply: true },
  });
  // Bots don't receive their own messages, so store the reply from the response.
  const reply = parseUpdate({ message: sent });
  if (reply) await saveMessage(bot, reply);
}

// Upserts the message and downloads attachments it doesn't have yet. An
// attachment that fails to download is stored with `error` and no content, so
// Telegram does not retry the whole update.
async function saveMessage(bot: Bot, m: ParsedMessage): Promise<void> {
  const fields = {
    chatType: m.chatType,
    chatTitle: m.chatTitle,
    senderId: m.senderId,
    senderName: m.senderName,
    text: m.text,
    sentAt: m.sentAt,
    editedAt: m.editedAt,
    raw: m.raw as unknown as Prisma.InputJsonValue,
  };
  const row = await prisma.botMessage.upsert({
    where: { botId_chatId_messageId: { botId: bot.id, chatId: m.chatId, messageId: m.messageId } },
    create: { teamId: bot.teamId, botId: bot.id, chatId: m.chatId, messageId: m.messageId, ...fields },
    update: fields,
    select: { id: true, attachments: { select: { fileUniqueId: true } } },
  });

  const have = new Set(row.attachments.map((a) => a.fileUniqueId));
  const token = botToken(bot);
  for (const a of m.attachments) {
    if (have.has(a.fileUniqueId)) continue;
    let content: Buffer | null = null;
    let error: string | null = null;
    if (a.size != null && a.size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
      error = "file is larger than 20 MB, the Bot API download limit";
    } else {
      try {
        content = await telegramDownload(token, a.fileId);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await prisma.botAttachment.createMany({
      data: [
        {
          messageId: row.id,
          ...a,
          size: content?.length ?? a.size,
          sha256: content ? createHash("sha256").update(content).digest("hex") : null,
          content: content ? new Uint8Array(content) : null,
          error,
        },
      ],
      skipDuplicates: true,
    });
  }

  await prisma.bot.update({ where: { id: bot.id }, data: { lastMessageAt: new Date() } });
}
