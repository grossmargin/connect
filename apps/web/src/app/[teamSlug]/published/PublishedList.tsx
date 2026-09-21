"use client";

import { App, Button, Form, Input, Modal, Popconfirm, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createScope, deleteScope, updateScope } from "./actions";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { useCurrentTeam } from "../../TeamContext";

export type ScopeRow = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  toolsetIds: string[];
};
export type ToolsetOption = { id: string; name: string };

export function PublishedList({
  scopes,
  toolsets,
}: {
  scopes: ScopeRow[];
  toolsets: ToolsetOption[];
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [edit, setEdit] = useState<ScopeRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const path = (s: ScopeRow) => (s.isDefault ? `/${teamSlug}` : `/${teamSlug}/${s.slug}`);
  const toolsetName = (id: string) => toolsets.find((t) => t.id === id)?.name;

  const remove = (s: ScopeRow) => {
    setPendingId(s.id);
    start(async () => {
      const r = await deleteScope(teamId, s.id);
      setPendingId(null);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Deleted");
      router.refresh();
    });
  };

  const columns: ColumnsType<ScopeRow> = [
    {
      title: "Name",
      key: "name",
      render: (_, s) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{s.name}</span>
          {s.isDefault && <Tag color="geekblue">Default</Tag>}
        </div>
      ),
    },
    {
      title: "Endpoint",
      key: "endpoint",
      width: 260,
      render: (_, s) => <CopyId value={path(s)} />,
    },
    {
      title: "Published MCPs",
      key: "toolsets",
      width: 220,
      render: (_, s) =>
        s.toolsetIds.length === 0 ? (
          <span className="text-sm text-gray-400">None</span>
        ) : (
          <span className="text-sm text-gray-600">
            {s.toolsetIds.length === 1
              ? toolsetName(s.toolsetIds[0]) ?? "1 MCP"
              : `${s.toolsetIds.length} MCPs`}
          </span>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, s) => (
        <span className="inline-flex items-center gap-1">
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => setEdit(s)} />
          </Tooltip>
          {s.isDefault ? (
            <span className="inline-block w-8" />
          ) : (
            <Popconfirm
              title="Delete this published MCP?"
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(s)}
            >
              <Tooltip title="Delete">
                <Button type="text" danger icon={<DeleteOutlined />} loading={pendingId === s.id} />
              </Tooltip>
            </Popconfirm>
          )}
        </span>
      ),
    },
  ];

  return (
    <Page breadcrumb={[{ title: "Published MCPs" }]}>
      <PageIntro
        title="Published MCPs"
        description="Publish a chosen subset of your Federated MCPs at an endpoint. The default scope is served at your team root; named scopes are served at /team/<name>."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)}>
            New published MCP
          </Button>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={scopes}
        pagination={false}
        onRow={(s) => ({ onClick: () => setEdit(s), className: "group cursor-pointer" })}
        locale={{ emptyText: "No published MCPs" }}
      />

      <NewScopeModal open={newOpen} onClose={() => setNewOpen(false)} />
      {edit && <EditScopeModal scope={edit} toolsets={toolsets} open onClose={() => setEdit(null)} />}
    </Page>
  );
}

function NewScopeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createScope(teamId, v.name, v.slug ?? "");
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Published MCP created");
        onClose();
        form.resetFields();
        router.refresh();
      }),
    );

  return (
    <Modal
      title="New published MCP"
      open={open}
      onCancel={onClose}
      okText="Create"
      onOk={submit}
      confirmLoading={pending}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" className="!text-sm">
        A named scope is served at <Typography.Text code>/team/&lt;id&gt;</Typography.Text>. Pick which
        Federated MCPs it exposes after creating it.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input placeholder="e.g. Public" autoFocus />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Id"
          extra="Path segment for the endpoint. Letters, digits and underscore only; defaults from the name."
        >
          <Input placeholder="e.g. public" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function EditScopeModal({
  scope,
  toolsets,
  open,
  onClose,
}: {
  scope: ScopeRow;
  toolsets: ToolsetOption[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await updateScope(
          teamId,
          scope.id,
          v.name ?? scope.name,
          v.slug ?? scope.slug,
          v.toolsetIds ?? [],
        );
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Saved");
        onClose();
        router.refresh();
      }),
    );

  const endpoint = scope.isDefault ? `/${teamSlug}` : `/${teamSlug}/${scope.slug}`;

  return (
    <Modal
      title={scope.isDefault ? "Default published MCP" : `Edit — ${scope.name}`}
      open={open}
      onCancel={onClose}
      okText="Save"
      onOk={submit}
      confirmLoading={pending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ name: scope.name, slug: scope.slug, toolsetIds: scope.toolsetIds }}
      >
        {!scope.isDefault && (
          <>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
              <Input autoFocus />
            </Form.Item>
            <Form.Item
              name="slug"
              label="Id"
              extra="Path segment for the endpoint. Letters, digits and underscore only."
            >
              <Input />
            </Form.Item>
          </>
        )}
        <Form.Item label="Endpoint">
          <CopyId value={endpoint} />
        </Form.Item>
        <Form.Item
          name="toolsetIds"
          label="Published Federated MCPs"
          extra={
            toolsets.length
              ? "Only these are exposed at this endpoint."
              : "No Federated MCPs yet — create one first."
          }
        >
          <Select
            mode="multiple"
            placeholder={toolsets.length ? "Pick Federated MCPs to publish" : "None available"}
            options={toolsets.map((t) => ({ value: t.id, label: t.name }))}
            optionFilterProp="label"
            suffixIcon={<ShareAltOutlined />}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
