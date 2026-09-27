"use client";

import { Alert, App, Button, Descriptions, Empty, Menu, Tag, Typography } from "antd";
import { PaperClipOutlined, ReloadOutlined, RobotOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import dayjs from "dayjs";
import { reconnectBot } from "../actions";
import { BOT_STATUS_TAG, type BotStatus } from "../status";
import { DetailHeader } from "@/ui/components/DetailHeader";
import { Page } from "@/ui/components/Page";
import { StatusPill } from "@/ui/components/StatusPill";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";

export type ChatRow = { chatId: string; title: string; type: string | null; messages: number; lastAt: string | null };
export type MessageRow = {
  id: string;
  senderName: string | null;
  text: string | null;
  sentAt: string;
  editedAt: string | null;
  attachments: { id: string; kind: string; fileName: string | null; size: number | null; error: string | null }[];
};

function formatSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function BotView({
  bot,
  webhook,
  chats,
  chatId,
  messages,
  limit,
}: {
  bot: { id: string; name: string; username: string | null; status: BotStatus; lastError: string | null; expectedWebhookUrl: string };
  webhook: { url: string; pending: number; lastError: string | null } | null;
  chats: ChatRow[];
  chatId: string | null;
  messages: MessageRow[];
  limit: number;
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [pending, start] = useTransition();
  const base = `/${teamSlug}/bots/${bot.id}`;

  const reconnect = () =>
    start(async () => {
      const r = await reconnectBot(teamId, bot.id);
      if (r?.error) message.error(r.error);
      else message.success("Webhook set");
      router.refresh();
    });

  const webhookMismatch = webhook && webhook.url !== bot.expectedWebhookUrl;

  return (
    <Page breadcrumb={[{ title: "Bots", href: `/${teamSlug}/bots` }, { title: bot.name }]}>
      <DetailHeader
        icon={<RobotOutlined />}
        title={bot.name}
        subtitle={bot.username ? `@${bot.username} · Telegram` : "Telegram"}
        tag={<StatusPill tone={BOT_STATUS_TAG[bot.status].tone} label={BOT_STATUS_TAG[bot.status].label} />}
        backHref={`/${teamSlug}/bots`}
        backLabel="All bots"
      />

      {bot.lastError && <Alert type="error" showIcon message={bot.lastError} className="!mb-4" />}
      {webhookMismatch && (
        <Alert
          type="warning"
          showIcon
          className="!mb-4"
          message={
            webhook.url
              ? `The webhook points to ${webhook.url}, not this app. Another service may be using the bot.`
              : "No webhook is set. The bot doesn't deliver messages here."
          }
        />
      )}

      <Descriptions size="small" column={3} className="!mb-6">
        <Descriptions.Item label="Webhook">
          <Button size="small" icon={<ReloadOutlined />} loading={pending} onClick={reconnect}>
            Reconnect
          </Button>
        </Descriptions.Item>
        <Descriptions.Item label="Pending updates">{webhook ? webhook.pending : "—"}</Descriptions.Item>
        <Descriptions.Item label="Last delivery error">{webhook?.lastError ?? "—"}</Descriptions.Item>
      </Descriptions>

      {chats.length === 0 ? (
        <Empty description="No messages yet. Add the bot to a group, or send it a direct message." />
      ) : (
        <div className="flex gap-6">
          <Menu
            className="w-64 flex-none !border-r !border-gray-200"
            selectedKeys={chatId ? [chatId] : []}
            items={chats.map((c) => ({
              key: c.chatId,
              label: (
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.title}</span>
                  <span className="text-xs text-gray-400">{c.messages}</span>
                </span>
              ),
            }))}
            onClick={({ key }) => router.push(`${base}?chat=${encodeURIComponent(key)}`)}
          />
          <div className="min-w-0 flex-1">
            {messages.length === limit && (
              <Typography.Text type="secondary" className="!mb-3 block text-xs">
                Showing the latest {limit} messages.
              </Typography.Text>
            )}
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-medium text-gray-700">{m.senderName ?? "Unknown"}</span>
                    <span title={m.sentAt}>{dayjs(m.sentAt).format("YYYY-MM-DD HH:mm")}</span>
                    {m.editedAt && <span title={m.editedAt}>edited {timeAgo(m.editedAt)}</span>}
                  </div>
                  {m.text && <div className="whitespace-pre-wrap break-words text-sm text-gray-900">{m.text}</div>}
                  {m.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.attachments.map((a) =>
                        a.error ? (
                          <Tag key={a.id} color="red" title={a.error}>
                            {a.kind}: not saved
                          </Tag>
                        ) : (
                          <a key={a.id} href={`/api/bots/attachments/${a.id}`} target="_blank" rel="noreferrer">
                            <Tag icon={<PaperClipOutlined />}>
                              {a.fileName ?? a.kind} {formatSize(a.size)}
                            </Tag>
                          </a>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
