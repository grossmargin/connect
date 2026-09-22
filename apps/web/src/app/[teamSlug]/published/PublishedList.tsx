"use client";

import { App, Button, Popconfirm, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ApiOutlined, AppstoreOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteScope } from "./actions";
import { CopyId } from "@/ui/components/CopyId";
import { Page, PageIntro } from "@/ui/components/Page";
import { useCurrentTeam } from "@/ui/components/TeamContext";

export type ScopeRow = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  connections: string[];
  groups: { slug: string; tenants: string[] }[];
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
      width: 200,
      render: (_, s) => (
        <div className="whitespace-nowrap">
          <CopyId value={path(s)} />
        </div>
      ),
    },
    {
      title: "Members",
      key: "members",
      render: (_, s) => <Members scope={s} />,
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
        onRow={(s) => ({ onClick: () => router.push(editHref(s)), className: "group cursor-pointer align-top" })}
        locale={{ emptyText: "No published MCPs" }}
      />
    </Page>
  );
}

// A slug chip. Border is always present but transparent, so the hover color
// causes no layout shift. `tone` picks the palette.
function Chip({
  children,
  tone = "gray",
  icon,
}: {
  children: React.ReactNode;
  tone?: "gray" | "indigo" | "muted";
  icon?: React.ReactNode;
}) {
  const palette = {
    gray: "bg-gray-100 text-gray-700 hover:border-gray-400",
    indigo: "bg-indigo-50 text-indigo-700 font-medium hover:border-indigo-400",
    muted: "bg-gray-50 text-gray-500 hover:border-gray-300",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-transparent px-1 py-px font-mono transition-colors ${palette}`}
    >
      {icon}
      {children}
    </span>
  );
}

// Lists every MCP the endpoint serves: individual members, then each group with
// its tenant slugs. Dense, tiny font.
function Members({ scope }: { scope: ScopeRow }) {
  const { connections, groups } = scope;
  if (connections.length === 0 && groups.length === 0) {
    return <span className="text-sm text-gray-400">None</span>;
  }
  return (
    <div className="flex flex-col gap-1 py-1 text-[11px] leading-tight">
      {connections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {connections.map((c) => (
            <Chip key={c} icon={<ApiOutlined className="text-[10px] text-gray-400" />}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.slug} className="flex flex-wrap items-center gap-1">
          <Chip tone="indigo" icon={<AppstoreOutlined className="text-[10px]" />}>
            {g.slug}
          </Chip>
          <span className="text-gray-300">·</span>
          {g.tenants.length === 0 ? (
            <span className="italic text-gray-400">no tenants</span>
          ) : (
            g.tenants.map((t) => (
              <Chip key={t} tone="muted">
                {t}
              </Chip>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
