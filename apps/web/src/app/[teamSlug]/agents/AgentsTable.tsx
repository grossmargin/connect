"use client";

import { App, Avatar, Button, Form, Input, Modal, Popconfirm, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, LinkOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAgent, deleteAgent } from "./actions";
import { Page, PageIntro } from "@/ui/components/Page";
import { useCurrentTeam } from "@/ui/components/TeamContext";

export type AgentRow = {
  id: string;
  name: string;
  systemPromptUrl: string | null;
  bots: string[];
  bundles: string[];
};

function tags(xs: string[]) {
  return xs.length ? xs.map((x) => <Tag key={x}>{x}</Tag>) : <span className="text-gray-400">—</span>;
}

export function AgentsTable({ agents }: { agents: AgentRow[] }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = (id: string) =>
    start(async () => {
      await deleteAgent(teamId, id);
      message.success("Agent deleted");
      router.refresh();
    });

  const columns: ColumnsType<AgentRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600" icon={<UserOutlined />} />
          <div className="leading-tight">
            <div className="font-medium text-gray-900">{name}</div>
            {row.systemPromptUrl && (
              <a
                href={row.systemPromptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkOutlined /> System prompt
              </a>
            )}
          </div>
        </div>
      ),
    },
    { title: "Bots", dataIndex: "bots", render: tags },
    { title: "Bundled MCPs", dataIndex: "bundles", render: tags },
    {
      title: "",
      key: "actions",
      width: 60,
      align: "right",
      render: (_, row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title="Delete this agent?"
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
    <Page breadcrumb={[{ title: "Agents" }]}>
      <PageIntro
        title="Agents"
        description="An agent watches chats through its bots and works with the tools of its bundled MCPs."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New agent
          </Button>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={agents}
        pagination={false}
        onRow={(row) => ({
          onClick: () => router.push(`/${teamSlug}/agents/${row.id}`),
          className: "group cursor-pointer",
        })}
        locale={{ emptyText: "No agents yet" }}
      />
      <NewAgentModal open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

function NewAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createAgent(teamId, v.name);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        onClose();
        form.resetFields();
        router.push(`/${teamSlug}/agents/${r.id}`);
      }),
    );

  return (
    <Modal title="New agent" open={open} onCancel={onClose} okText="Create" confirmLoading={pending} onOk={submit} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input placeholder="e.g. Finance assistant" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
