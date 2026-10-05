"use client";

import { App, Button, Card, Modal, Popconfirm, Spin, Table, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deleteScopeState, getScopeState } from "../actions";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";

export type StateRow = { namespace: string; key: string; size: number; updatedAt: string };

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isText(v: unknown): v is { type: "text"; text: string } {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "text" && typeof (v as { text?: unknown }).text === "string";
}

// State saved through the bundle's state_ tools. Read-only, plus delete.
export function MemoryCard({ scopeId, states }: { scopeId: string; states: StateRow[] }) {
  const router = useRouter();
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [open, setOpen] = useState<{ row: StateRow; value?: unknown } | null>(null);
  const [, start] = useTransition();

  const view = (row: StateRow) => {
    setOpen({ row });
    start(async () => {
      const r = await getScopeState(teamId, scopeId, row.namespace, row.key);
      if ("error" in r) message.error(r.error);
      else setOpen({ row, value: r.value });
    });
  };

  const remove = (row: StateRow) =>
    start(async () => {
      const r = await deleteScopeState(teamId, scopeId, row.namespace, row.key);
      if ("error" in r) message.error(r.error);
      router.refresh();
    });

  return (
    <Card title="Memory">
      <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
        State that callers saved through the <Typography.Text code>state_</Typography.Text> tools. Click a row to see
        its value.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey={(r) => `${r.namespace}\u0000${r.key}`}
        dataSource={states}
        pagination={states.length > 20 ? { pageSize: 20 } : false}
        locale={{ emptyText: "Nothing saved yet." }}
        onRow={(r) => ({ onClick: () => view(r), className: "cursor-pointer" })}
        columns={[
          { title: "Namespace", dataIndex: "namespace" },
          { title: "Key", dataIndex: "key" },
          { title: "Size", dataIndex: "size", width: 90, render: formatSize },
          { title: "Updated", dataIndex: "updatedAt", width: 130, render: (v: string) => <span title={v}>{timeAgo(v)}</span> },
          {
            key: "del",
            width: 48,
            render: (_, r) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Popconfirm title="Delete this state?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(r)}>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </span>
            ),
          },
        ]}
      />

      <Modal
        title={open ? `${open.row.namespace} / ${open.row.key}` : ""}
        open={!!open}
        onCancel={() => setOpen(null)}
        footer={null}
        width={800}
        destroyOnHidden
      >
        {open && !("value" in open) ? (
          <Spin />
        ) : isText(open?.value) ? (
          <div className="prose prose-sm max-h-[70vh] max-w-none overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Markdown remarkPlugins={[remarkGfm]}>{open.value.text}</Markdown>
          </div>
        ) : (
          <pre className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
            {JSON.stringify(open?.value, null, 2)}
          </pre>
        )}
      </Modal>
    </Card>
  );
}
