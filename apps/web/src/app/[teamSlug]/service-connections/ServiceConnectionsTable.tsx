"use client";

import { Alert, App, Avatar, Button, Checkbox, Form, Input, Modal, Popconfirm, Radio, Select, Table, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CloudServerOutlined, DeleteOutlined, LinkOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createServiceConnection,
  deleteServiceConnection,
  testServiceConnectionAction,
  updateServiceConnection,
} from "./actions";
import { Page, PageIntro } from "@/ui/components/Page";
import { StatusPill, type Tone } from "@/ui/components/StatusPill";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";
import {
  GOOGLE_SERVICES,
  QUICKBOOKS_PRODUCTS,
  SERVICE_TYPE_LIST,
  serviceTypeDef,
  type GoogleAccess,
  type Selection,
  type ServiceConnectionState,
} from "@/lib/isomorphic/serviceConnectionTypes";

export type ServiceConnectionRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  selection: Selection;
  granted: Selection | null;
  description: string;
  state: ServiceConnectionState;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  bundles: number;
};

type TestResult = { ok: true; summary: string } | { ok: false; error: string };

const STATE_TAG: Record<ServiceConnectionState, { tone: Tone; label: string }> = {
  NOT_CONNECTED: { tone: "default", label: "Not connected" },
  CONNECTED: { tone: "success", label: "Connected" },
  NEEDS_RECONNECT: { tone: "warning", label: "Needs reconnect" },
};

function connectHref(id: string) {
  return `/api/service-connections/${id}/connect`;
}

export function ServiceConnectionsTable({
  connections,
  flash,
}: {
  connections: ServiceConnectionRow[];
  flash: { connected?: string; error?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [modal, setModal] = useState<{ conn: ServiceConnectionRow | null } | null>(null);
  const [pending, start] = useTransition();
  const [testingId, setTestingId] = useState<string | null>(null);

  // Result of the OAuth callback, passed in the query string once.
  useEffect(() => {
    if (flash.connected) message.success(`Connected ${flash.connected}`);
    if (flash.error) message.error(`Connection failed: ${flash.error}`, 10);
    if (flash.connected || flash.error) router.replace(pathname);
  }, [flash.connected, flash.error, message, pathname, router]);

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteServiceConnection(teamId, id);
      if (r?.error) message.error(r.error);
      else message.success("Service connection deleted");
      router.refresh();
    });

  const test = (id: string) => {
    setTestingId(id);
    start(async () => {
      const r = await testServiceConnectionAction(teamId, id);
      setTestingId(null);
      if (!("ok" in r)) message.error(r.error);
      else showTest(message, r);
      router.refresh();
    });
  };

  const columns: ColumnsType<ServiceConnectionRow> = [
    {
      title: "Connection",
      dataIndex: "name",
      render: (name: string, row) => (
        <div className="flex items-center gap-3">
          <Avatar shape="square" className="!bg-indigo-50 !text-indigo-600" icon={<CloudServerOutlined />} />
          <div className="leading-tight">
            <div className="font-medium text-gray-900">{name}</div>
            <div className="text-xs text-gray-400">
              {row.slug} · {row.description}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 200,
      render: (_, row) => {
        const last = timeAgo(row.lastTestedAt);
        const failed = row.state !== "NOT_CONNECTED" && row.lastTestOk === false;
        return (
          <div className="flex flex-col items-start gap-1">
            {failed ? (
              <Tooltip title={row.lastTestError}>
                <span>
                  <StatusPill tone="error" label="Error" />
                </span>
              </Tooltip>
            ) : (
              <StatusPill tone={STATE_TAG[row.state].tone} label={STATE_TAG[row.state].label} />
            )}
            {last && row.state !== "NOT_CONNECTED" && <span className="text-xs text-gray-400">tested {last}</span>}
          </div>
        );
      },
    },
    { title: "Bundles", dataIndex: "bundles", width: 90, align: "right" },
    {
      title: "",
      key: "actions",
      width: 220,
      align: "right",
      render: (_, row) => (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.state !== "CONNECTED" || row.lastTestOk === false ? (
            <Button size="small" type="primary" icon={<LinkOutlined />} href={connectHref(row.id)}>
              {row.state === "NOT_CONNECTED" ? "Connect" : "Reconnect"}
            </Button>
          ) : null}
          {row.state !== "NOT_CONNECTED" && (
            <Tooltip title="Test">
              <Button
                type="text"
                icon={<ThunderboltOutlined />}
                loading={pending && testingId === row.id}
                onClick={() => test(row.id)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Delete this service connection? Bundles lose access to it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(row.id)}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <Page breadcrumb={[{ title: "Service Connections" }]}>
      <PageIntro
        title="Service Connections"
        description="Google and QuickBooks accounts you connect with OAuth. Add them to a bundle to let agents use them."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ conn: null })}>
            New service connection
          </Button>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={connections}
        pagination={false}
        onRow={(row) => ({ onClick: () => setModal({ conn: row }), className: "group cursor-pointer" })}
        locale={{ emptyText: "No service connections yet" }}
      />
      {modal && (
        <ServiceConnectionModal
          conn={modal.conn}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </Page>
  );
}

function showTest(message: ReturnType<typeof App.useApp>["message"], r: TestResult) {
  if (r.ok) message.success(`Test passed: ${r.summary}`);
  else message.error(`Test failed: ${r.error}`, 8);
}

function defaultSelection(type: string): Selection {
  return type === "quickbooks"
    ? Object.fromEntries(QUICKBOOKS_PRODUCTS.map((p) => [p.key, true]))
    : Object.fromEntries(GOOGLE_SERVICES.map((s) => [s.key, s.defaultAccess]));
}

function ServiceConnectionModal({
  conn,
  onClose,
  onSaved,
}: {
  conn: ServiceConnectionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(conn?.type ?? SERVICE_TYPE_LIST[0].type);
  const [selection, setSelection] = useState<Selection>(conn?.selection ?? defaultSelection(type));
  const def = serviceTypeDef(type);

  const changeType = (t: string) => {
    setType(t);
    setSelection(defaultSelection(t));
  };

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        setError(null);
        const input = { name: v.name ?? "", slug: v.slug ?? "", selection };
        if (conn) {
          const r = await updateServiceConnection(teamId, conn.id, input);
          if ("error" in r) return setError(r.error);
          // New scopes need a fresh consent.
          if (r.needsReconnect && conn.state !== "NOT_CONNECTED") {
            window.location.href = connectHref(conn.id);
            return;
          }
          message.success("Saved");
          onSaved();
          return;
        }
        const r = await createServiceConnection(teamId, type, input);
        if ("error" in r) return setError(r.error);
        window.location.href = connectHref(r.id);
      }),
    );

  const changed = conn && JSON.stringify(selection) !== JSON.stringify(conn.selection);
  const okText = !conn
    ? `Connect ${def?.label ?? ""}`.trim()
    : changed && conn.state !== "NOT_CONNECTED"
      ? "Save and reconnect"
      : "Save";

  return (
    <Modal
      title={conn ? `Edit — ${conn.name}` : "New service connection"}
      open
      onCancel={onClose}
      okText={okText}
      confirmLoading={pending}
      onOk={submit}
      width={560}
      destroyOnHidden
    >
      {def && (
        <Typography.Paragraph type="secondary" className="!text-sm">
          {def.description}
        </Typography.Paragraph>
      )}
      {error && <Alert type="error" message={error} className="!mb-3" showIcon />}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{ type, name: conn?.name, slug: conn?.slug }}
      >
        <Form.Item name="type" label="Service">
          <Select
            disabled={!!conn}
            onChange={changeType}
            options={SERVICE_TYPE_LIST.map((t) => ({ value: t.type, label: t.label }))}
          />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input placeholder={type === "quickbooks" ? "e.g. Acme QuickBooks" : "e.g. Finance Google"} autoFocus />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Id"
          extra="The connection_id agents use. Letters, digits and underscore only; defaults from the name."
        >
          <Input placeholder={type === "quickbooks" ? "e.g. acme_qb" : "e.g. finance_google"} />
        </Form.Item>
        <Form.Item label="Access">
          {type === "quickbooks" ? (
            <QuickbooksProducts value={selection} onChange={setSelection} />
          ) : (
            <GoogleScopesMatrix value={selection} onChange={setSelection} />
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

const GOOGLE_LEVELS: { value: GoogleAccess; label: string }[] = [
  { value: "none", label: "Do not connect" },
  { value: "readonly", label: "Read-only" },
  { value: "readwrite", label: "Read-write" },
];

// Rows: Google services. Columns: access level. One radio per row.
function GoogleScopesMatrix({ value, onChange }: { value: Selection; onChange: (v: Selection) => void }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-xs text-gray-500">
          <th className="py-1 text-left font-normal" />
          {GOOGLE_LEVELS.map((l) => (
            <th key={l.value} className="py-1 text-center font-normal">
              {l.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {GOOGLE_SERVICES.map((s) => {
          const current = (value[s.key] as GoogleAccess | undefined) ?? "none";
          return (
            <tr key={s.key} className="border-t border-gray-100">
              <td className="py-2">{s.label}</td>
              {GOOGLE_LEVELS.map((l) => (
                <td key={l.value} className="py-2 text-center">
                  <Radio
                    checked={current === l.value}
                    onChange={() => onChange({ ...value, [s.key]: l.value })}
                    aria-label={`${s.label}: ${l.label}`}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuickbooksProducts({ value, onChange }: { value: Selection; onChange: (v: Selection) => void }) {
  const checked = QUICKBOOKS_PRODUCTS.filter((p) => value[p.key]);
  const all = checked.length === QUICKBOOKS_PRODUCTS.length;
  const setAll = (on: boolean) => onChange(Object.fromEntries(QUICKBOOKS_PRODUCTS.map((p) => [p.key, on])));
  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        checked={all}
        indeterminate={!all && checked.length > 0}
        onChange={(e) => setAll(e.target.checked)}
      >
        All
      </Checkbox>
      {QUICKBOOKS_PRODUCTS.map((p) => (
        <Checkbox
          key={p.key}
          className="!ml-6"
          checked={!!value[p.key]}
          onChange={(e) => onChange({ ...value, [p.key]: e.target.checked })}
        >
          {p.label}
        </Checkbox>
      ))}
      <Typography.Text type="secondary" className="!text-xs">
        QuickBooks has no read-only access: the token can read and write.
      </Typography.Text>
    </div>
  );
}
