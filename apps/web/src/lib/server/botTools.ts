import "server-only";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/serverEnv";
import { ATTACHMENT_LINK_TTL_SECONDS, signAttachmentQuery } from "@/lib/server/attachmentLinks";
import { errorResult, text } from "@/lib/server/mcpToolShared";
import { isUuid } from "@/lib/isomorphic/ids";

// Read-only tools over the messages saved by a bundle's bots. Every query is
// limited to `botIds`, the bots the bundle exposes.

// A chat is addressed as "<botId>:<chatId>": chat ids are unique per bot only.
function chatKey(botId: string, chatId: string): string {
  return `${botId}:${chatId}`;
}
function parseChatKey(key: unknown): { botId: string; chatId: string } | null {
  if (typeof key !== "string") return null;
  const i = key.indexOf(":");
  return i > 0 ? { botId: key.slice(0, i), chatId: key.slice(i + 1) } : null;
}

const MESSAGES_DEFAULT = 100;
const MESSAGES_MAX = 500;
const SEARCH_DEFAULT = 50;
const SEARCH_MAX = 200;

const timeArgs = {
  since: { type: "string", description: "ISO 8601 time. Only messages sent at or after it." },
  until: { type: "string", description: "ISO 8601 time. Only messages sent before it." },
};

export const BOT_TOOLS: Tool[] = [
  {
    name: "bots_get_bots",
    description:
      "List the bots: id, name, type (platform), @username, description, and the chats each bot saved messages from.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "bots_list_chats",
    description:
      "List the chats (groups, channels, direct messages) the bots saved messages from, newest activity first.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Only chats whose title contains this text." } },
    },
  },
  {
    name: "bots_get_messages",
    description:
      "Read messages in time order, oldest first, from all chats of all bots or from one chat. Each message " +
      "names its chat, chat title and bot. Returns the latest messages in the range; " +
      "pass `nextBefore` from the result as `before` to page back to older ones.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Only this chat (id from bots_list_chats). Default: all chats." },
        ...timeArgs,
        before: { type: "string", description: "Paging cursor: `nextBefore` from the previous result." },
        limit: { type: "number", description: `Max messages. Default ${MESSAGES_DEFAULT}, max ${MESSAGES_MAX}.` },
      },
    },
  },
  {
    name: "bots_search_messages",
    description: "Find messages whose text contains the query (case-insensitive), newest first, across all chats.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        chat: { type: "string", description: "Only this chat (id from bots_list_chats)." },
        sender: { type: "string", description: "Only senders whose name contains this text." },
        ...timeArgs,
        limit: { type: "number", description: `Max messages. Default ${SEARCH_DEFAULT}, max ${SEARCH_MAX}.` },
      },
      required: ["query"],
    },
  },
  {
    name: "bots_download_attachment",
    description:
      "Get a file attached to a message. Returns the file name, MIME type, size and `downloadUrl`. The file " +
      "content is not in the result: download the file from `downloadUrl` (e.g. `curl -o <fileName> <downloadUrl>`). " +
      `The URL needs no auth and expires after ${ATTACHMENT_LINK_TTL_SECONDS / 60} minutes; call this tool again for a new one.`,
    inputSchema: {
      type: "object",
      properties: { attachmentId: { type: "string", description: "`attachmentId` from a message." } },
      required: ["attachmentId"],
    },
  },
];
export const BOT_TOOL_NAMES = new Set(BOT_TOOLS.map((t) => t.name));

function json(data: unknown): CallToolResult {
  return text(JSON.stringify(data, null, 2));
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
}

// sentAt filter from since/until. Throws on an unparsable time.
function sentAtFilter(args: Record<string, unknown>): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  const date = (key: string) => {
    const v = args[key];
    if (v == null || v === "") return undefined;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new Error(`"${key}" is not a valid ISO 8601 time.`);
    return d;
  };
  const since = date("since");
  const until = date("until");
  if (since) f.gte = since;
  if (until) f.lt = until;
  return Object.keys(f).length ? f : undefined;
}

const MESSAGE_SELECT = {
  id: true,
  botId: true,
  chatId: true,
  chatTitle: true,
  messageId: true,
  senderId: true,
  senderName: true,
  text: true,
  sentAt: true,
  editedAt: true,
  raw: true,
  bot: { select: { name: true } },
  attachments: { select: { id: true, kind: true, fileName: true, mimeType: true, size: true, error: true } },
} satisfies Prisma.BotMessageSelect;

type MessageRow = Prisma.BotMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function formatMessage(m: MessageRow) {
  const replyTo = (m.raw as { reply_to_message?: { message_id?: number } } | null)?.reply_to_message?.message_id;
  return {
    chat: chatKey(m.botId, m.chatId),
    chatTitle: m.chatTitle,
    bot: m.bot.name,
    messageId: m.messageId,
    sender: m.senderName,
    senderId: m.senderId,
    sentAt: m.sentAt.toISOString(),
    ...(m.editedAt && { editedAt: m.editedAt.toISOString() }),
    ...(replyTo != null && { replyTo: String(replyTo) }),
    text: m.text,
    ...(m.attachments.length > 0 && {
      attachments: m.attachments.map((a) => ({
        attachmentId: a.id,
        kind: a.kind,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        ...(a.error && { error: a.error }),
      })),
    }),
  };
}

async function listChats(botIds: string[], args: Record<string, unknown>) {
  const [counts, latest, bots] = await Promise.all([
    prisma.botMessage.groupBy({
      by: ["botId", "chatId"],
      where: { botId: { in: botIds } },
      _count: true,
      _min: { sentAt: true },
      _max: { sentAt: true },
    }),
    prisma.botMessage.findMany({
      where: { botId: { in: botIds } },
      distinct: ["botId", "chatId"],
      orderBy: [{ botId: "asc" }, { chatId: "asc" }, { sentAt: "desc" }],
      select: { botId: true, chatId: true, chatTitle: true, chatType: true },
    }),
    prisma.bot.findMany({ where: { id: { in: botIds } }, select: { id: true, name: true } }),
  ]);
  const meta = new Map(latest.map((l) => [chatKey(l.botId, l.chatId), l]));
  const botName = new Map(bots.map((b) => [b.id, b.name]));
  const q = typeof args.query === "string" ? args.query.toLowerCase() : "";

  return counts
    .map((c) => {
      const key = chatKey(c.botId, c.chatId);
      return {
        chat: key,
        botId: c.botId,
        title: meta.get(key)?.chatTitle ?? null,
        type: meta.get(key)?.chatType ?? null,
        bot: botName.get(c.botId) ?? c.botId,
        messages: c._count,
        firstMessageAt: c._min.sentAt?.toISOString() ?? null,
        lastMessageAt: c._max.sentAt?.toISOString() ?? null,
      };
    })
    .filter((c) => !q || (c.title ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

async function getBots(botIds: string[]) {
  const [bots, chats] = await Promise.all([
    prisma.bot.findMany({
      where: { id: { in: botIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, platform: true, username: true, description: true },
    }),
    listChats(botIds, {}),
  ]);
  return bots.map((b) => ({
    botId: b.id,
    name: b.name,
    type: b.platform,
    username: b.username ? `@${b.username}` : null,
    description: b.description,
    chats: chats
      .filter((c) => c.botId === b.id)
      .map(({ chat, title, type, messages, lastMessageAt }) => ({ chat, title, type, messages, lastMessageAt })),
  }));
}

async function getMessages(botIds: string[], args: Record<string, unknown>): Promise<CallToolResult> {
  const where: Prisma.BotMessageWhereInput = { botId: { in: botIds }, sentAt: sentAtFilter(args) };
  if (args.chat != null && args.chat !== "") {
    const chat = parseChatKey(args.chat);
    if (!chat || !botIds.includes(chat.botId)) return errorResult("Unknown chat. Get chat ids from bots_list_chats.");
    where.botId = chat.botId;
    where.chatId = chat.chatId;
  }
  const limit = clampLimit(args.limit, MESSAGES_DEFAULT, MESSAGES_MAX);
  const before = args.before == null ? null : String(args.before);
  if (before !== null && !isUuid(before)) return errorResult("`before` must be `nextBefore` from a previous result.");

  // Newest first to apply the limit, then flip to time order. The cursor is the
  // oldest row of the previous page; `id` breaks ties within one second.
  const rows = await prisma.botMessage.findMany({
    where,
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    ...(before && { cursor: { id: before }, skip: 1 }),
    take: limit + 1,
    select: MESSAGE_SELECT,
  });
  const more = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return json({
    messages: page.map((m) => formatMessage(m)),
    ...(more && page.length > 0 && { nextBefore: page[0].id }),
  });
}

async function searchMessages(botIds: string[], args: Record<string, unknown>): Promise<CallToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return errorResult("query is required.");
  const where: Prisma.BotMessageWhereInput = {
    botId: { in: botIds },
    text: { contains: query, mode: "insensitive" },
    sentAt: sentAtFilter(args),
  };
  if (args.chat != null) {
    const chat = parseChatKey(args.chat);
    if (!chat || !botIds.includes(chat.botId)) return errorResult("Unknown chat. Get chat ids from bots_list_chats.");
    where.botId = chat.botId;
    where.chatId = chat.chatId;
  }
  if (typeof args.sender === "string" && args.sender.trim()) {
    where.senderName = { contains: args.sender.trim(), mode: "insensitive" };
  }
  const rows = await prisma.botMessage.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: clampLimit(args.limit, SEARCH_DEFAULT, SEARCH_MAX),
    select: MESSAGE_SELECT,
  });
  return json({ messages: rows.map((m) => formatMessage(m)) });
}

async function downloadAttachment(
  botIds: string[],
  args: Record<string, unknown>,
  origin: string,
): Promise<CallToolResult> {
  const attachmentId = String(args.attachmentId ?? "");
  const a = isUuid(attachmentId)
    ? await prisma.botAttachment.findFirst({
        where: { id: attachmentId, message: { botId: { in: botIds } } },
        select: { id: true, kind: true, fileName: true, mimeType: true, size: true, error: true },
      })
    : null;
  if (!a) return errorResult("Attachment not found.");
  if (a.error) return errorResult(`The attachment was not saved: ${a.error}`);

  const { exp, sig } = signAttachmentQuery(serverEnv.AUTH_SECRET, a.id);
  return json({
    attachmentId: a.id,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    downloadUrl: `${origin}/api/bots/attachments/${a.id}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
}

// Throws on bad arguments (e.g. a malformed time); the caller reports it as a tool error.
// `origin` is the base for download URLs.
export async function runBotTool(
  botIds: string[],
  name: string,
  args: Record<string, unknown>,
  origin: string,
): Promise<CallToolResult> {
  if (name === "bots_get_bots") return json({ bots: await getBots(botIds) });
  if (name === "bots_list_chats") return json({ chats: await listChats(botIds, args) });
  if (name === "bots_get_messages") return getMessages(botIds, args);
  if (name === "bots_search_messages") return searchMessages(botIds, args);
  if (name === "bots_download_attachment") return downloadAttachment(botIds, args, origin);
  return errorResult(`Unknown tool "${name}".`);
}
