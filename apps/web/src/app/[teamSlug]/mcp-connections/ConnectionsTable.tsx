"use client";

import { App, AutoComplete, Avatar, Button, Form, Input, Modal, Popconfirm, Segmented, Table, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CodeOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createConnection, createHeadersConnection, deleteConnection } from "./actions";
import { ConnectionTechModal } from "./ConnectionTechModal";
import { STATUS_TAG, type ConnectionStatus } from "./status";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { StatusPill } from "../../StatusPill";
import { timeAgo } from "@/lib/timeAgo";
import { KNOWN_MCP_SERVERS } from "@/lib/knownMcpServers";

export type ConnectionRow = {
  id: string;
  name: string;
  slug: string;
  status: ConnectionStatus;
  url: string;
  lastTestedAt: string | null;
  lastConnectedAt: string | null;
};

// Known third-party MCP servers we've vetted (DCR/redirect findings live in
// lib/knownMcpServers.ts). Users can still paste any other URL.
const PROVIDERS = KNOWN_MCP_SERVERS;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function initials(name: string): string {
  const first = name.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)[0] ?? "?";
  return first.slice(0, 2).toUpperCase();
}

export function ConnectionsTable({ teamId, connections }: { teamId: string; connections: ConnectionRow[] }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [tech, setTech] = useState<ConnectionRow | null>(null);
  const [pending, start] = useTransition();

  const remove = (id: string) =>
    start(async () => {
      await deleteConnection(teamId, id);
      message.success("Connection deleted");
      router.refresh();
    });

  const connected = connections.filter((c) => c.status === "CONNECTED").length;
  const summary =
    connections.length === 0
      ? "No connections"
      : `${connections.length} ${connections.length === 1 ? "connection" : "connections"} · ${
          connected === connections.length ? "all healthy" : `${connected} connected`
        }`;

  const columns: ColumnsType<ConnectionRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600">
            {initials(name)}
          </Avatar>
          <div className="leading-tight">
            <div className="font-medium text-gray-900">{name}</div>
            <div className="text-xs text-gray-400">{host(row.url)}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 170,
      render: (s: ConnectionStatus, row) => {
        const tested = timeAgo(row.lastTestedAt);
        const conn = timeAgo(row.lastConnectedAt);
        const sub = tested ? `tested ${tested}` : conn ? `connected ${conn}` : null;
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill tone={STATUS_TAG[s].tone} label={STATUS_TAG[s].label} />
            {sub && <span className="text-xs text-gray-400">{sub}</span>}
          </div>
        );
      },
    },
    {
      title: "ID",
      dataIndex: "slug",
      width: 220,
      render: (slug: string) => <CopyId value={slug} />,
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, row) => (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Technical details">
            <Button type="text" icon={<CodeOutlined />} onClick={() => setTech(row)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => router.push(`/${teamId}/mcp-connections/${row.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this connection?"
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
    <Page breadcrumb={[{ title: "MCP Connections" }]}>
      <PageIntro
        title="MCP Connections"
        description="One connection per provider account. Toolsets group them for agents."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New connection
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-end">
        <span className="text-sm text-gray-400">{summary}</span>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={connections}
        pagination={false}
        onRow={(row) => ({
          onClick: () => router.push(`/${teamId}/mcp-connections/${row.id}`),
          className: "group cursor-pointer",
        })}
        locale={{ emptyText: "No connections yet" }}
      />

      <NewConnectionModal teamId={teamId} open={open} onClose={() => setOpen(false)} />

      {tech && (
        <ConnectionTechModal
          teamId={teamId}
          connectionId={tech.id}
          connectionName={tech.name}
          open={!!tech}
          onClose={() => setTech(null)}
        />
      )}
    </Page>
  );
}

type AuthMode = "DCR" | "HEADERS";

function NewConnectionModal({ teamId, open, onClose }: { teamId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<AuthMode>("DCR");

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r =
          mode === "HEADERS"
            ? await createHeadersConnection(teamId, v.name, v.url, v.headers ?? "")
            : await createConnection(teamId, v.name, v.url);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success(mode === "HEADERS" ? "Connection added" : "Connected and registered");
        onClose();
        form.resetFields();
        setMode("DCR");
        router.push(`/${teamId}/mcp-connections/${r.id}`);
      }),
    );

  return (
    <Modal
      title="New connection"
      open={open}
      onCancel={onClose}
      okText={mode === "HEADERS" ? "Add" : "Verify & add"}
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Segmented<AuthMode>
        block
        value={mode}
        onChange={setMode}
        options={[
          { label: "OAuth (auto-register)", value: "DCR" },
          { label: "Static headers", value: "HEADERS" },
        ]}
        className="!mb-3"
      />
      <Typography.Paragraph type="secondary" className="!text-sm">
        {mode === "HEADERS"
          ? "Send fixed HTTP headers (e.g. a bearer token) with every request. Use this for servers that authenticate with a token/PAT instead of OAuth. Headers are encrypted; nothing is verified until you run Test."
          : "We verify the URL and register this app with the server (Dynamic Client Registration)."}
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. Ramp - Acme Inc" autoFocus />
        </Form.Item>
        <Form.Item
          name="url"
          label="Server URL"
          extra={mode === "HEADERS" ? "The MCP server URL." : "Pick a known provider or paste any MCP server URL."}
          rules={[
            { required: true, message: "Enter the MCP server URL" },
            { type: "url", message: "Enter a valid URL" },
          ]}
        >
          <AutoComplete
            options={PROVIDERS.map((p) => ({ value: p.url, label: `${p.name} — ${host(p.url)}` }))}
            filterOption={(input, option) =>
              `${option?.value} ${option?.label}`.toLowerCase().includes(input.toLowerCase())
            }
            onSelect={(url) => {
              const p = PROVIDERS.find((x) => x.url === url);
              if (p && !form.getFieldValue("name")) form.setFieldValue("name", p.name);
            }}
            placeholder="https://mcp.example.com/mcp"
          />
        </Form.Item>
        {mode === "HEADERS" && (
          <Form.Item
            name="headers"
            label="Headers"
            extra="One per line, `Name: value`. Blank lines and `#` comments are ignored."
            rules={[{ required: true, message: "Enter at least one header" }]}
          >
            <Input.TextArea rows={4} placeholder={"Authorization: Bearer <token>"} className="font-mono !text-sm" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
