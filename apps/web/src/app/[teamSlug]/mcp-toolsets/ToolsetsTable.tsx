"use client";

import { App, Avatar, Button, Form, Input, Modal, Popconfirm, Select, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppstoreOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createToolset, deleteToolset } from "./actions";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { StatusPill, type Tone } from "../../StatusPill";
import { timeAgo } from "@/lib/timeAgo";

export type ToolsetRow = {
  id: string;
  name: string;
  slug: string;
  connectionCount: number;
  lastTestOk: boolean | null;
  lastTestedAt: string | null;
};
export type ConnectionOption = { id: string; name: string };

function health(ok: boolean | null): { tone: Tone; label: string } {
  if (ok === null) return { tone: "default", label: "Untested" };
  return ok ? { tone: "success", label: "Healthy" } : { tone: "error", label: "Error" };
}

export function ToolsetsTable({
  teamId,
  toolsets,
  connections,
}: {
  teamId: string;
  toolsets: ToolsetRow[];
  connections: ConnectionOption[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = (id: string) =>
    start(async () => {
      await deleteToolset(teamId, id);
      message.success("Federated MCP deleted");
      router.refresh();
    });

  const columns: ColumnsType<ToolsetRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600" icon={<AppstoreOutlined />} />
          <span className="font-medium text-gray-900">{name}</span>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 170,
      render: (_, row) => {
        const h = health(row.lastTestOk);
        const ago = timeAgo(row.lastTestedAt);
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill tone={h.tone} label={h.label} />
            {ago && <span className="text-xs text-gray-400">tested {ago}</span>}
          </div>
        );
      },
    },
    {
      title: "Servers",
      dataIndex: "connectionCount",
      width: 110,
      render: (n: number) => (
        <span className="inline-flex items-center gap-1.5 text-gray-600">
          <DatabaseOutlined className="text-gray-400" />
          {n}
        </span>
      ),
    },
    {
      title: "ID",
      dataIndex: "slug",
      width: 200,
      render: (slug: string) => <CopyId value={slug} />,
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, row) => (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => router.push(`/${teamId}/mcp-toolsets/${row.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this federated MCP?"
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
    <Page breadcrumb={[{ title: "Federated MCPs" }]}>
      <PageIntro
        title="Federated MCPs"
        description="A federated MCP exposes one set of tools backed by several identical servers."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New federated MCP
          </Button>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={toolsets}
        pagination={false}
        onRow={(row) => ({
          onClick: () => router.push(`/${teamId}/mcp-toolsets/${row.id}`),
          className: "group cursor-pointer",
        })}
        locale={{ emptyText: "No federated MCPs yet" }}
      />

      <NewToolsetModal
        teamId={teamId}
        connections={connections}
        open={open}
        onClose={() => setOpen(false)}
      />
    </Page>
  );
}

function NewToolsetModal({
  teamId,
  connections,
  open,
  onClose,
}: {
  teamId: string;
  connections: ConnectionOption[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createToolset(teamId, v.name, v.connectionIds ?? []);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Federated MCP created");
        onClose();
        form.resetFields();
        router.push(`/${teamId}/mcp-toolsets/${r.id}`);
      }),
    );

  return (
    <Modal
      title="New federated MCP"
      open={open}
      onCancel={onClose}
      okText="Create"
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. Finance" autoFocus />
        </Form.Item>
        <Form.Item name="connectionIds" label="MCP servers">
          <Select
            mode="multiple"
            placeholder={connections.length ? "Pick servers to include" : "No connections yet"}
            options={connections.map((c) => ({ value: c.id, label: c.name }))}
            optionFilterProp="label"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
