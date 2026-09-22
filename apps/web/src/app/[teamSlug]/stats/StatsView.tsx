"use client";

import { useTransition } from "react";
import { Card, Col, Row, Segmented, Select, Spin, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Page, PageIntro } from "@/ui/components/Page";
import type { BucketPoint, TeamStats, UserRow } from "@/lib/server/stats";
import type { Granularity } from "@/lib/isomorphic/statsRange";

dayjs.extend(utc);

const INDIGO = "#6366f1";
const RED = "#ef4444";
const TEAL = "#14b8a6";
const AMBER = "#f59e0b";

const PRESET_OPTIONS = [
  { label: "Last 24h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "month" },
];

function tickFmt(g: Granularity) {
  return (ms: number) => dayjs.utc(ms).format(g === "hour" ? "HH:00" : "MMM D");
}
function labelFmt(g: Granularity) {
  return (label: unknown) =>
    dayjs.utc(Number(label)).format(g === "hour" ? "MMM D, HH:00 [UTC]" : "MMM D, YYYY [UTC]");
}

// Small chart card wrapper: a titled Card with a fixed-height responsive chart.
function ChartCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <Card size="small" title={title} extra={extra}>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// One Google-Sheets-style line sparkline: a colored label naming the metric, a
// thin line with no axes, and the metric total. Two of these stack inside a
// single table cell (calls over sessions).
function SparkRow({
  values,
  color,
  total,
  label,
}: {
  values: number[];
  color: string;
  total: number;
  label: string;
}) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="flex items-center gap-2" title={`${label}: ${total}`}>
      <span className="w-14 shrink-0 text-[10px] font-medium leading-none" style={{ color }}>
        {label}
      </span>
      <div style={{ height: 15, width: 84 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-gray-500">{total.toLocaleString()}</span>
    </div>
  );
}

function TrendCell({ user }: { user: UserRow }) {
  return (
    <div className="flex flex-col gap-1">
      <SparkRow values={user.sparkCalls} color={INDIGO} total={user.calls} label="MCP calls" />
      <SparkRow values={user.sparkSessions} color={TEAL} total={user.sessions} label="sessions" />
    </div>
  );
}

export function StatsView({ teamName, stats }: { teamName: string; stats: TeamStats }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  const { range, summary, series, topTools, users, userOptions, selectedUser } = stats;
  const g = range.granularity;

  const navigate = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(params)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  const onPreset = (value: string) => navigate({ range: value });

  const callData = series.map((p: BucketPoint) => ({ ...p, ok: p.calls - p.errors }));
  const errorRate = summary.calls ? (summary.errors / summary.calls) * 100 : 0;

  const userColumns: ColumnsType<UserRow> = [
    {
      title: "User",
      key: "user",
      render: (_, u) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{u.label}</span>
          {u.kind === "SERVICE_ACCOUNT" && <Tag color="gold">service</Tag>}
        </div>
      ),
    },
    {
      title: "Tool calls",
      dataIndex: "calls",
      width: 120,
      align: "right",
      defaultSortOrder: "descend",
      sorter: (a, b) => a.calls - b.calls,
      render: (v: number, u) => (
        <span>
          {v.toLocaleString()}
          {u.errors > 0 && <span className="ml-2 text-xs text-red-500">{u.errors} err</span>}
        </span>
      ),
    },
    {
      title: "Sessions",
      dataIndex: "sessions",
      width: 100,
      align: "right",
      sorter: (a, b) => a.sessions - b.sessions,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Spend",
      dataIndex: "costUsd",
      width: 100,
      align: "right",
      sorter: (a, b) => a.costUsd - b.costUsd,
      render: (v: number) => (v > 0 ? `$${v.toFixed(2)}` : <span className="text-gray-300">—</span>),
    },
    {
      title: "Trend",
      key: "trend",
      width: 190,
      render: (_, u) => <TrendCell user={u} />,
    },
  ];

  const bucketLabel = g === "hour" ? "hour" : "day";

  return (
    <Page breadcrumb={[{ title: "Team Stats" }]}>
      <PageIntro
        title="Team Stats"
        description={
          selectedUser
            ? `Usage for ${selectedUser} in ${teamName}. Times shown in UTC.`
            : `Usage and activity for ${teamName}. Times shown in UTC.`
        }
        action={
          <div className="flex items-center gap-2">
            <Select
              allowClear
              showSearch
              placeholder="All users"
              style={{ width: 220 }}
              value={selectedUser ?? undefined}
              onChange={(v) => navigate({ user: v ?? null })}
              options={userOptions.map((e) => ({ label: e, value: e }))}
              filterOption={(input, opt) => (opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            />
            <Segmented value={range.preset} options={PRESET_OPTIONS} onChange={(v) => onPreset(String(v))} />
          </div>
        }
      />

      <Spin spinning={pending}>
        {/* Summary cards */}
        <Row gutter={[16, 16]} className="mb-4">
          <Col xs={12} md={8} lg={5}>
            <Card size="small">
              <Statistic title="Tool calls" value={summary.calls} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={5}>
            <Card size="small">
              <Statistic title="Sessions" value={summary.sessions} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={5}>
            <Card size="small">
              <Statistic title="Active users" value={summary.activeUsers} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic
                title="Errors"
                value={summary.errors}
                valueStyle={{ color: summary.errors ? RED : undefined }}
                suffix={<span className="text-xs text-gray-400">{errorRate.toFixed(1)}%</span>}
              />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={5}>
            <Card size="small">
              <Statistic title="Spend" prefix="$" precision={2} value={summary.costUsd} />
            </Card>
          </Col>
        </Row>

        {/* Time series */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <ChartCard title={`Tool calls by ${bucketLabel}`}>
              <BarChart data={callData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                <XAxis
                  dataKey="ms"
                  tickFormatter={tickFmt(g)}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 11, fill: "#8c8c8c" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8c8c8c" }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={labelFmt(g)} />
                <Bar dataKey="ok" stackId="c" name="ok" fill={INDIGO} />
                <Bar dataKey="errors" stackId="c" name="errors" fill={RED} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartCard>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title={`Sessions by ${bucketLabel}`}>
              <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                <XAxis
                  dataKey="ms"
                  tickFormatter={tickFmt(g)}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 11, fill: "#8c8c8c" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8c8c8c" }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={labelFmt(g)} />
                <Bar dataKey="sessions" name="sessions" fill={TEAL} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartCard>
          </Col>
        </Row>

        {/* Spend over time + top tools */}
        <Row gutter={[16, 16]} className="mt-4">
          <Col xs={24} lg={12}>
            <ChartCard title="Spend over time" extra={<span className="text-xs text-gray-400">Cowork / Claude Code</span>}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AMBER} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                <XAxis
                  dataKey="ms"
                  tickFormatter={tickFmt(g)}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 11, fill: "#8c8c8c" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#8c8c8c" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip
                  labelFormatter={labelFmt(g)}
                  formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "spend"]}
                />
                <Area type="monotone" dataKey="costUsd" stroke={AMBER} fill="url(#spend)" strokeWidth={2} />
              </AreaChart>
            </ChartCard>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title="Top tools">
              <BarChart data={topTools} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef0f3" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#8c8c8c" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="tool"
                  width={190}
                  tick={{ fontSize: 11, fill: "#595959" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(v: unknown, n: unknown) => [Number(v), String(n)]} />
                <Bar dataKey="calls" name="calls" radius={[0, 3, 3, 0]}>
                  {topTools.map((t) => (
                    <Cell key={t.tool} fill={t.errors > 0 ? "#818cf8" : INDIGO} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>
          </Col>
        </Row>

        {/* Per-user table */}
        <Card size="small" title="Users" className="mt-6">
          <Typography.Paragraph type="secondary" className="!mb-3 !text-sm">
            Tool calls come from the MCP call log; sessions and spend come from Cowork / Claude Code
            telemetry. The trend column overlays a calls sparkline (indigo) and a sessions sparkline
            (teal) per {bucketLabel}.
          </Typography.Paragraph>
          <Table
            rowKey="key"
            size="small"
            columns={userColumns}
            dataSource={users}
            pagination={false}
            locale={{ emptyText: "No activity in this period" }}
          />
        </Card>
      </Spin>
    </Page>
  );
}
