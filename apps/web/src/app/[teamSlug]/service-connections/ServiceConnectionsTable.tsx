"use client";

import { Alert, App, Avatar, Button, Form, Input, Modal, Popconfirm, Select, Table, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CloudServerOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createServiceConnection,
  deleteServiceConnection,
  testServiceConnectionAction,
  updateServiceConnection,
} from "./actions";
import { Page, PageIntro } from "@/ui/components/Page";
import { StatusPill } from "@/ui/components/StatusPill";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";
import { SERVICE_TYPE_LIST, serviceTypeDef } from "@/lib/isomorphic/serviceConnectionTypes";

export type ServiceConnectionRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, string>;
  hasSecrets: boolean;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  bundles: number;
};

type TestResult = { ok: true; summary: string } | { ok: false; error: string };

export function ServiceConnectionsTable({ connections }: { connections: ServiceConnectionRow[] }) {
  const router = useRouter();
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [modal, setModal] = useState<{ conn: ServiceConnectionRow | null } | null>(null);
  const [pending, start] = useTransition();
  const [testingId, setTestingId] = useState<string | null>(null);

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
      if ("error" in r && !("ok" in r)) message.error(r.error);
      else showTest(message, r as TestResult);
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
              {serviceTypeDef(row.type)?.label ?? row.type} · {row.slug}
              {row.config.host && ` · ${row.config.host}`}
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
        const pill =
          row.lastTestOk == null ? (
            <StatusPill tone="default" label="Not tested" />
          ) : row.lastTestOk ? (
            <StatusPill tone="success" label="OK" />
          ) : (
            <Tooltip title={row.lastTestError}>
              <span>
                <StatusPill tone="error" label="Error" />
              </span>
            </Tooltip>
          );
        return (
          <div className="flex flex-col items-start gap-1">
            {pill}
            {last && <span className="text-xs text-gray-400">tested {last}</span>}
          </div>
        );
      },
    },
    { title: "Bundles", dataIndex: "bundles", width: 100, align: "right" },
    {
      title: "",
      key: "actions",
      width: 110,
      align: "right",
      render: (_, row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Test">
            <Button
              type="text"
              icon={<ThunderboltOutlined />}
              loading={pending && testingId === row.id}
              onClick={() => test(row.id)}
            />
          </Tooltip>
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
        description="Connections to known services, such as Nango. Add them to a bundle to give agents their tools."
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
  const def = serviceTypeDef(type);

  const initialValues = {
    type,
    name: conn?.name,
    slug: conn?.slug,
    values: Object.fromEntries(
      (def?.fields ?? []).filter((f) => !f.secret).map((f) => [f.name, conn?.config[f.name] ?? f.defaultValue]),
    ),
  };

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        setError(null);
        const input = { name: v.name ?? "", slug: v.slug ?? "", values: v.values ?? {} };
        const r = conn
          ? await updateServiceConnection(teamId, conn.id, input)
          : await createServiceConnection(teamId, type, input);
        if ("error" in r) {
          setError(r.error);
          return;
        }
        showTest(message, r.test);
        onSaved();
      }),
    );

  return (
    <Modal
      title={conn ? `Edit — ${conn.name}` : "New service connection"}
      open
      onCancel={onClose}
      okText={conn ? "Save and test" : "Add and test"}
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      {def && (
        <Typography.Paragraph type="secondary" className="!text-sm">
          {def.description}
        </Typography.Paragraph>
      )}
      {error && <Alert type="error" message={error} className="!mb-3" showIcon />}
      <Form form={form} layout="vertical" requiredMark={false} preserve={false} initialValues={initialValues}>
        <Form.Item name="type" label="Service">
          <Select
            disabled={!!conn}
            onChange={setType}
            options={SERVICE_TYPE_LIST.map((t) => ({ value: t.type, label: t.label }))}
          />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input placeholder="e.g. Nango prod" autoFocus />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Id"
          extra="Part of each connection_id agents see. Letters, digits and underscore only; defaults from the name."
        >
          <Input placeholder="e.g. nango_prod" />
        </Form.Item>
        {def?.fields.map((f) => (
          <Form.Item
            key={f.name}
            name={["values", f.name]}
            label={f.label}
            extra={f.extra}
            rules={f.required && !(f.secret && conn?.hasSecrets) ? [{ required: true, message: `Enter ${f.label.toLowerCase()}` }] : []}
          >
            {f.secret ? (
              <Input.Password
                autoComplete="off"
                placeholder={conn?.hasSecrets ? "•••••••• (leave empty to keep)" : f.placeholder}
              />
            ) : (
              <Input placeholder={f.placeholder} />
            )}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
