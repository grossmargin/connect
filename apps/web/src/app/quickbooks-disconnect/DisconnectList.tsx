"use client";

import { App, Button, Card, Empty, Popconfirm, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { useState, useTransition } from "react";
import { disconnectQuickbooks } from "./actions";

export type QbRow = {
  id: string;
  name: string;
  vaultName: string;
  teamName: string;
  connectionId: string;
  provider: string | null;
  // connected: Nango confirms it's QuickBooks; unverified: Nango unreachable;
  // missing: Nango has no such connection (orphaned credential).
  status: "connected" | "unverified" | "missing";
};

export function DisconnectList({ rows: initial }: { rows: QbRow[] }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const disconnect = (row: QbRow) => {
    setPendingId(row.id);
    start(async () => {
      const r = await disconnectQuickbooks(row.id);
      setPendingId(null);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      setRows((rs) => rs.filter((x) => x.id !== row.id));
      message.success(`Disconnected ${row.name}`);
    });
  };

  const columns: ColumnsType<QbRow> = [
    {
      title: "Connection",
      key: "name",
      render: (_, row) => (
        <div className="leading-tight">
          <div className="font-medium text-gray-900">{row.name}</div>
          <div className="text-xs text-gray-400">{row.vaultName}</div>
        </div>
      ),
    },
    {
      title: "Team",
      dataIndex: "teamName",
      width: 180,
      render: (teamName: string) => <span className="text-sm text-gray-600">{teamName}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 150,
      align: "right",
      render: (_, row) => (
        <Popconfirm
          title="Disconnect QuickBooks?"
          description="This removes the connection from this app. You can reconnect later."
          okText="Disconnect"
          okButtonProps={{ danger: true }}
          onConfirm={() => disconnect(row)}
        >
          <Button danger loading={pendingId === row.id}>
            Disconnect
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[820px] px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <SafetyCertificateOutlined />
        </span>
        <div>
          <h1 className="m-0 text-2xl font-semibold text-gray-900">Disconnect QuickBooks</h1>
          <div className="text-sm text-gray-500">
            Manage the QuickBooks companies connected to Grossmargin Connect.
          </div>
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty description="No QuickBooks connections." />
        ) : (
          <>
            <Typography.Paragraph type="secondary" className="!text-sm">
              Disconnecting removes the connection from this app so it can no longer access that
              QuickBooks company.
            </Typography.Paragraph>
            <Table rowKey="id" columns={columns} dataSource={rows} pagination={false} />
          </>
        )}
      </Card>
    </main>
  );
}
