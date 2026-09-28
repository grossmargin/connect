"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { Page, PageIntro } from "@/ui/components/Page";
import { StatusPill, type Tone } from "@/ui/components/StatusPill";
import type { HealthStatus, McpHealth, NangoHealth, TeamHealth } from "@/lib/server/connectionHealth";

const STATUS: Record<HealthStatus, { tone: Tone; label: string }> = {
  ok: { tone: "success", label: "OK" },
  error: { tone: "error", label: "Error" },
  skipped: { tone: "default", label: "Not tested" },
};

function statusCell(s: HealthStatus, row: { error?: string; durationMs: number }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={STATUS[s].tone} label={STATUS[s].label} />
      {s !== "skipped" && <span className="text-xs text-gray-400">{row.durationMs} ms</span>}
    </div>
  );
}

function errorCell(error?: string) {
  if (!error) return <span className="text-gray-300">—</span>;
  return (
    <Typography.Paragraph className="!mb-0 text-xs text-red-600" ellipsis={{ rows: 2, expandable: true }}>
      {error}
    </Typography.Paragraph>
  );
}

function summary(items: { status: HealthStatus }[]): string {
  const failed = items.filter((i) => i.status === "error").length;
  return failed ? `${failed} of ${items.length} failing` : `${items.length} total`;
}

export function ConnectionStatusesView({ teamSlug, health }: { teamSlug: string; health: TeamHealth }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const mcpColumns: ColumnsType<McpHealth> = [
    {
      title: "Connection",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="leading-tight">
          <Link href={`/${teamSlug}/mcp-connections/${row.id}`} className="font-medium">
            {name}
          </Link>
          <div className="text-xs text-gray-400">{row.url}</div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", width: 130, render: statusCell },
    { title: "Tools", dataIndex: "toolCount", width: 80, render: (n?: number) => n ?? "—" },
    { title: "Error", dataIndex: "error", render: errorCell },
  ];

  const nangoColumns: ColumnsType<NangoHealth> = [
    {
      title: "Credential",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="leading-tight">
          <Link href={`/${teamSlug}/vaults/${row.vaultId}`} className="font-medium">
            {name}
          </Link>
          <div className="text-xs text-gray-400">
            {row.vaultName} · {row.providerConfigKey ?? "?"} / {row.connectionId ?? "?"}
          </div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", width: 130, render: statusCell },
    { title: "Error", dataIndex: "error", render: errorCell },
  ];

  return (
    <Page breadcrumb={[{ title: "Team Stats", href: `/${teamSlug}/stats` }, { title: "Connection Statuses" }]}>
      <PageIntro
        title="Connection Statuses"
        description={`Live test of every MCP connection and Nango credential. Ran at ${new Date(health.checkedAt).toLocaleString()}.`}
        action={
          <Button icon={<ReloadOutlined />} loading={pending} onClick={() => start(() => router.refresh())}>
            Re-test
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card size="small" title="MCP connections" extra={summary(health.mcp)}>
          <Table rowKey="id" size="small" pagination={false} columns={mcpColumns} dataSource={health.mcp} />
        </Card>
        <Card size="small" title="Nango credentials" extra={summary(health.nango)}>
          <Table rowKey="id" size="small" pagination={false} columns={nangoColumns} dataSource={health.nango} />
        </Card>
      </div>
    </Page>
  );
}
