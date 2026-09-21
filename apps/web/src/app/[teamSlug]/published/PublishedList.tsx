"use client";

import { App, Button, Popconfirm, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteScope } from "./actions";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { useCurrentTeam } from "../../TeamContext";

export type ScopeRow = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  connectionCount: number;
  groupCount: number;
};

export function PublishedList({ scopes }: { scopes: ScopeRow[] }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const path = (s: ScopeRow) => (s.isDefault ? `/${teamSlug}` : `/${teamSlug}/${s.slug}`);
  const editHref = (s: ScopeRow) => `/${teamSlug}/published/${s.id}`;

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
      title: "Members",
      key: "members",
      width: 200,
      render: (_, s) => {
        const parts: string[] = [];
        if (s.connectionCount) parts.push(`${s.connectionCount} MCP${s.connectionCount === 1 ? "" : "s"}`);
        if (s.groupCount) parts.push(`${s.groupCount} group${s.groupCount === 1 ? "" : "s"}`);
        return parts.length ? (
          <span className="text-sm text-gray-600">{parts.join(" · ")}</span>
        ) : (
          <span className="text-sm text-gray-400">None</span>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, s) => (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => router.push(editHref(s))} />
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
        description="Each Published MCP is an endpoint that exposes its member MCPs. The default one is served at your team root; named ones at /team/<id>."
        action={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(`/${teamSlug}/published/new`)}
          >
            New published MCP
          </Button>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={scopes}
        pagination={false}
        onRow={(s) => ({ onClick: () => router.push(editHref(s)), className: "group cursor-pointer" })}
        locale={{ emptyText: "No published MCPs" }}
      />
    </Page>
  );
}
