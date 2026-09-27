"use client";

import { Alert, App, Avatar, Button, Form, Input, Modal, Popconfirm, Table, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, RobotOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBot, deleteBot } from "./actions";
import { BOT_STATUS_TAG, type BotStatus } from "./status";
import { Page, PageIntro } from "@/ui/components/Page";
import { StatusPill } from "@/ui/components/StatusPill";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";

export type BotRow = {
  id: string;
  name: string;
  platform: string;
  username: string | null;
  status: BotStatus;
  messages: number;
  lastMessageAt: string | null;
};

export function BotsTable({ bots }: { bots: BotRow[] }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteBot(teamId, id);
      if (r?.error) message.error(r.error);
      else message.success("Bot deleted");
      router.refresh();
    });

  const columns: ColumnsType<BotRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600" icon={<RobotOutlined />} />
          <div className="leading-tight">
            <div className="font-medium text-gray-900">{name}</div>
            <div className="text-xs text-gray-400">
              {row.platform}
              {row.username && ` · @${row.username}`}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 170,
      render: (s: BotStatus, row) => {
        const last = timeAgo(row.lastMessageAt);
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill tone={BOT_STATUS_TAG[s].tone} label={BOT_STATUS_TAG[s].label} />
            {last && <span className="text-xs text-gray-400">last message {last}</span>}
          </div>
        );
      },
    },
    { title: "Messages", dataIndex: "messages", width: 120, align: "right" },
    {
      title: "",
      key: "actions",
      width: 60,
      align: "right",
      render: (_, row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title="Delete this bot and all its saved messages?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(row.id)}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} loading={pending} />
            </Tooltip>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <Page breadcrumb={[{ title: "Bots" }]}>
      <PageIntro
        title="Bots"
        description="Bots save every message and attachment from the chats they are added to."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New bot
          </Button>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={bots}
        pagination={false}
        onRow={(row) => ({
          onClick: () => router.push(`/${teamSlug}/bots/${row.id}`),
          className: "group cursor-pointer",
        })}
        locale={{ emptyText: "No bots yet" }}
      />
      <NewBotModal open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

function NewBotModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        setError(null);
        const r = await createBot(teamId, v.name ?? "", v.token);
        if ("error" in r) {
          setError(r.error);
          return;
        }
        onClose();
        form.resetFields();
        if (r.warning) modal.warning({ title: "Bot added with warnings", content: r.warning });
        else message.success("Bot added");
        router.push(`/${teamSlug}/bots/${r.id}`);
      }),
    );

  return (
    <Modal
      title="New Telegram bot"
      open={open}
      onCancel={onClose}
      okText="Add"
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" className="!text-sm">
        Create the bot in @BotFather with /newbot and paste its token. Turn off privacy mode (/setprivacy → Disable)
        before you add the bot to groups, or it sees only commands and mentions.
      </Typography.Paragraph>
      {error && <Alert type="error" message={error} className="!mb-3" showIcon />}
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" extra="Optional. Defaults to the bot's Telegram name.">
          <Input placeholder="e.g. Grossmargin Bot" autoFocus />
        </Form.Item>
        <Form.Item name="token" label="Bot token" rules={[{ required: true, message: "Paste the bot token" }]}>
          <Input.Password placeholder="123456789:AA..." autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
