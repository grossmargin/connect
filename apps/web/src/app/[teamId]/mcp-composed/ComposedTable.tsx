"use client";

import { App, Avatar, Button, Form, Input, Modal, Popconfirm, Select, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  DeploymentUnitOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWrapper, deleteWrapper } from "./actions";
import { COMPOSED_MCP_TYPES, typeLabel } from "./constants";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { StatusPill, type Tone } from "../../StatusPill";
import { timeAgo } from "@/lib/timeAgo";

export type WrapperRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  credentialCount: number;
  lastTestOk: boolean | null;
  lastTestedAt: string | null;
};
export type CredentialOption = { id: string; name: string; vaultName: string };

function health(ok: boolean | null): { tone: Tone; label: string } {
  if (ok === null) return { tone: "default", label: "Untested" };
  return ok ? { tone: "success", label: "Healthy" } : { tone: "error", label: "Error" };
}

export function ComposedTable({
  teamId,
  wrappers,
  credentials,
}: {
  teamId: string;
  wrappers: WrapperRow[];
  credentials: CredentialOption[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = (id: string) =>
    start(async () => {
      await deleteWrapper(teamId, id);
      message.success("Composed MCP deleted");
      router.refresh();
    });

  const columns: ColumnsType<WrapperRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600" icon={<DeploymentUnitOutlined />} />
          <span className="font-medium text-gray-900">{name}</span>
        </div>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 130,
      render: (type: string) => <Tag>{typeLabel(type)}</Tag>,
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
      title: "Credentials",
      dataIndex: "credentialCount",
      width: 120,
      render: (n: number) => (
        <span className="inline-flex items-center gap-1.5 text-gray-600">
          <KeyOutlined className="text-gray-400" />
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
              onClick={() => router.push(`/${teamId}/mcp-composed/${row.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this composed MCP?"
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
    <Page breadcrumb={[{ title: "Composed MCPs" }]}>
      <PageIntro
        title="Composed MCPs"
        description="A composed MCP wraps a third-party API as tools, backed by your credentials."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New composed MCP
          </Button>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={wrappers}
        pagination={false}
        onRow={(row) => ({
          onClick: () => router.push(`/${teamId}/mcp-composed/${row.id}`),
          className: "group cursor-pointer",
        })}
        locale={{ emptyText: "No composed MCPs yet" }}
      />

      <NewWrapperModal
        teamId={teamId}
        credentials={credentials}
        open={open}
        onClose={() => setOpen(false)}
      />
    </Page>
  );
}

function NewWrapperModal({
  teamId,
  credentials,
  open,
  onClose,
}: {
  teamId: string;
  credentials: CredentialOption[];
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
        const r = await createWrapper(teamId, v.name, v.type, v.credentialIds ?? []);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Composed MCP created");
        onClose();
        form.resetFields();
        router.push(`/${teamId}/mcp-composed/${r.id}`);
      }),
    );

  return (
    <Modal
      title="New composed MCP"
      open={open}
      onCancel={onClose}
      okText="Create"
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{ type: COMPOSED_MCP_TYPES[0].value }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. QuickBooks" autoFocus />
        </Form.Item>
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Select options={COMPOSED_MCP_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
        </Form.Item>
        <Form.Item name="credentialIds" label="Credentials">
          <Select
            mode="multiple"
            placeholder={credentials.length ? "Attach credentials" : "No credentials yet"}
            options={credentials.map((c) => ({ value: c.id, label: `${c.name} · ${c.vaultName}` }))}
            optionFilterProp="label"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
