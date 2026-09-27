import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { parseUpdate, isAddressedToBot } = await import("./telegram");

test("edited photo message: largest size, caption as text, edit time", () => {
  const m = parseUpdate({
    update_id: 1,
    edited_message: {
      message_id: 7,
      date: 1_700_000_000,
      edit_date: 1_700_000_060,
      chat: { id: -100123, type: "supergroup", title: "Finance" },
      from: { id: 42, first_name: "Ann", last_name: "Lee" },
      caption: "receipt",
      photo: [
        { file_id: "small", file_unique_id: "s", file_size: 100 },
        { file_id: "big", file_unique_id: "b", file_size: 900 },
      ],
    },
  });
  expect(m).toMatchObject({
    chatId: "-100123",
    chatTitle: "Finance",
    messageId: "7",
    senderName: "Ann Lee",
    text: "receipt",
    editedAt: new Date(1_700_000_060_000),
  });
  expect(m!.attachments).toEqual([
    { kind: "photo", fileId: "big", fileUniqueId: "b", fileName: null, mimeType: "image/jpeg", size: 900 },
  ]);
});

test("channel post is attributed to the channel; other updates are ignored", () => {
  const m = parseUpdate({
    channel_post: {
      message_id: 1,
      date: 1,
      chat: { id: -1, type: "channel", title: "News" },
      sender_chat: { id: -1, type: "channel", title: "News" },
      text: "hi",
    },
  });
  expect(m?.senderName).toBe("News");
  expect(parseUpdate({ update_id: 2, my_chat_member: {} })).toBeNull();
});

test("isAddressedToBot: direct messages, mentions, replies and commands", () => {
  const bot = { id: "99", username: "GrossmarginBot" };
  const group = { id: -1, type: "supergroup" };
  const msg = (extra: object) => ({ message_id: 1, date: 1, chat: group, ...extra });
  const mention = (text: string, at: string) => ({
    text,
    entities: [{ type: "mention", offset: text.indexOf(at), length: at.length }],
  });

  // Offsets are UTF-16 units; the emoji before the mention checks that.
  expect(isAddressedToBot(msg(mention("👋 hi @grossmarginbot", "@grossmarginbot")), bot)).toBe(true);
  expect(isAddressedToBot(msg(mention("hi @otherbot", "@otherbot")), bot)).toBe(false);
  expect(isAddressedToBot(msg({ text: "x", reply_to_message: { from: { id: 99 } } }), bot)).toBe(true);
  expect(isAddressedToBot(msg({ text: "x", reply_to_message: { from: { id: 5 } } }), bot)).toBe(false);
  expect(
    isAddressedToBot(msg({ text: "/help@GrossmarginBot", entities: [{ type: "bot_command", offset: 0, length: 20 }] }), bot),
  ).toBe(true);
  const dm = { message_id: 1, date: 1, chat: { id: 5, type: "private" } };
  expect(isAddressedToBot({ ...dm, text: "/start" }, bot)).toBe(true);
  expect(isAddressedToBot({ ...dm, text: "hello" }, bot)).toBe(true);
  expect(isAddressedToBot(msg({ text: "hello" }), bot)).toBe(false);
});
