import "server-only";
import { http } from "@/lib/server/http";

// Minimal Telegram Bot API client and update parsing.
// Docs: https://core.telegram.org/bots/api

const API = "https://api.telegram.org";

// Bots can't download files larger than this through the Bot API.
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// Update types we store. Everything else is not delivered.
export const TELEGRAM_ALLOWED_UPDATES = ["message", "edited_message", "channel_post", "edited_channel_post"];

export type TelegramBotInfo = {
  id: number;
  username?: string;
  first_name: string;
  // False while privacy mode is on: the bot then only sees commands and mentions.
  can_read_all_group_messages?: boolean;
};

export async function telegramCall<T>(token: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await http.post(`${API}/bot${token}/${method}`, params);
  const body = res.data as { ok?: boolean; result?: T; description?: string };
  if (!body?.ok) throw new Error(`Telegram ${method}: ${body?.description ?? `HTTP ${res.status}`}`);
  return body.result as T;
}

// Downloads a file by id. Throws when the file is over the Bot API limit.
export async function telegramDownload(token: string, fileId: string): Promise<Buffer> {
  const file = await telegramCall<{ file_path?: string; file_size?: number }>(token, "getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("file is not available for download");
  const res = await http.get(`${API}/file/bot${token}/${file.file_path}`, {
    responseType: "arraybuffer",
    timeout: 60_000,
    maxContentLength: TELEGRAM_MAX_DOWNLOAD_BYTES,
  });
  if (res.status !== 200) throw new Error(`download failed: HTTP ${res.status}`);
  return Buffer.from(res.data as ArrayBuffer);
}

// ---------- Update parsing ----------

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgChat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
type TgFile = { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string };
type TgEntity = { type: string; offset: number; length: number; user?: TgUser };

export type TgMessage = {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: TgChat;
  from?: TgUser;
  sender_chat?: TgChat;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  reply_to_message?: { from?: TgUser };
  photo?: TgFile[];
} & Partial<Record<(typeof FILE_KINDS)[number], TgFile>>;

export type ParsedAttachment = {
  kind: string;
  fileId: string;
  fileUniqueId: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
};

export type ParsedMessage = {
  chatId: string;
  chatType: string;
  chatTitle: string | null;
  messageId: string;
  senderId: string | null;
  senderName: string | null;
  text: string | null;
  sentAt: Date;
  editedAt: Date | null;
  attachments: ParsedAttachment[];
  raw: TgMessage;
};

const FILE_KINDS = ["document", "video", "audio", "voice", "animation", "video_note", "sticker"] as const;

function fullName(p: { first_name?: string; last_name?: string; title?: string; username?: string }): string | null {
  const name = p.title ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  return name || p.username || null;
}

// The message inside a stored update type, or null for anything else.
export function parseUpdate(update: Record<string, unknown>): ParsedMessage | null {
  const key = TELEGRAM_ALLOWED_UPDATES.find((k) => update[k]);
  if (!key) return null;
  const m = update[key] as TgMessage;

  const attachments: ParsedAttachment[] = [];
  const file = (kind: string, f: TgFile, mimeType = f.mime_type) =>
    attachments.push({
      kind,
      fileId: f.file_id,
      fileUniqueId: f.file_unique_id,
      fileName: f.file_name ?? null,
      mimeType: mimeType ?? null,
      size: f.file_size ?? null,
    });
  // A photo comes in several sizes, always JPEG; keep the largest.
  if (m.photo?.length) file("photo", m.photo[m.photo.length - 1], "image/jpeg");
  for (const kind of FILE_KINDS) {
    const f = m[kind];
    if (f) file(kind, f);
  }

  const sender = m.sender_chat ?? m.from;
  return {
    chatId: String(m.chat.id),
    chatType: m.chat.type,
    chatTitle: fullName(m.chat),
    messageId: String(m.message_id),
    senderId: sender ? String(sender.id) : null,
    senderName: sender ? fullName(sender) : null,
    text: m.text ?? m.caption ?? null,
    sentAt: new Date(m.date * 1000),
    editedAt: m.edit_date ? new Date(m.edit_date * 1000) : null,
    attachments,
    raw: m,
  };
}

// True when a new message is addressed to the bot: any direct message, an
// @mention, a tap-mention, a reply to the bot, or a /cmd@bot command.
export function isAddressedToBot(m: TgMessage, bot: { id: string; username: string | null }): boolean {
  if (m.chat.type === "private") return true;
  if (m.reply_to_message?.from && String(m.reply_to_message.from.id) === bot.id) return true;
  const body = m.text ?? m.caption ?? "";
  const username = bot.username?.toLowerCase();
  return (m.entities ?? m.caption_entities ?? []).some((e) => {
    if (e.type === "text_mention") return String(e.user?.id) === bot.id;
    if (e.type === "mention" && username) return body.slice(e.offset + 1, e.offset + e.length).toLowerCase() === username;
    // "/cmd@bot" in groups.
    if (e.type === "bot_command" && username) return body.slice(e.offset, e.offset + e.length).toLowerCase().endsWith(`@${username}`);
    return false;
  });
}
