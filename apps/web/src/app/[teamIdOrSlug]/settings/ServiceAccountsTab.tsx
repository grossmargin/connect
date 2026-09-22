"use client";

import { Alert, App, Button, Form, Input, Modal, Popconfirm, Table, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  addServiceAccountKey,
  createServiceAccount,
  deleteServiceAccount,
  listServiceAccountKeys,
  renameServiceAccount,
  revokeServiceAccountKey,
  type ServiceAccountKeyInfo,
} from "./actions";
import { CopyId } from "@/ui/components/CopyId";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";

export type ServiceAccountRow = {
  id: string;
  name: string;
  activeKeyCount: number;
  createdAt: string;
};

export function ServiceAccountsTab({ accounts }: { accounts: ServiceAccountRow[] }) {
  const { teamId } = useCurrentTeam();
  const router = useRouter();
  const { message } = App.useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<ServiceAccountRow | null>(null);
  const [manage, setManage] = useState<ServiceAccountRow | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const remove = (sa: ServiceAccountRow) =>
    startDelete(async () => {
      const r = await deleteServiceAccount(teamId, sa.id);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Service account deleted");
      router.refresh();
    });

  const columns: ColumnsType<ServiceAccountRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string) => <span className="font-medium text-gray-900">{name}</span>,
    },
    {
      title: "Keys",
      dataIndex: "activeKeyCount",
      width: 150,
      render: (n: number) => (
        <span className="text-sm text-gray-600">
          {n} {n === 1 ? "key" : "keys"}
        </span>
      ),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      width: 130,
      render: (v: string) => <span className="text-sm text-gray-500">{timeAgo(v)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 130,
      align: "right",
      render: (_, sa) => (
        <span className="inline-flex items-center gap-1">
          <Tooltip title="Manage keys">
            <Button type="text" icon={<KeyOutlined />} onClick={() => setManage(sa)} />
          </Tooltip>
          <Tooltip title="Rename">
            <Button type="text" icon={<EditOutlined />} onClick={() => setRename(sa)} />
          </Tooltip>
          <Popconfirm
            title="Delete this service account?"
            description="Its keys stop working immediately. This cannot be undone."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(sa)}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} loading={deleting} />
            </Tooltip>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Typography.Paragraph type="secondary" className="!mb-0 !text-sm">
          Machine identities that authenticate to the MCP server with a token.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)}>
          New service account
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        pagination={false}
        locale={{ emptyText: "No service accounts yet" }}
      />

      <NewServiceAccountModal
        teamId={teamId}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(key) => setRevealed(key)}
      />
      {rename && <RenameModal teamId={teamId} sa={rename} open onClose={() => setRename(null)} />}
      {manage && (
        <ManageKeysModal
          teamId={teamId}
          sa={manage}
          open
          onClose={() => setManage(null)}
          onReveal={(key) => setRevealed(key)}
        />
      )}
      <RevealKeyModal token={revealed} onClose={() => setRevealed(null)} />
    </>
  );
}

function NewServiceAccountModal({
  teamId,
  open,
  onClose,
  onCreated,
}: {
  teamId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createServiceAccount(teamId, v.name);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        onClose();
        form.resetFields();
        onCreated(r.key);
        router.refresh();
      }),
    );

  return (
    <Modal
      title="New service account"
      open={open}
      onCancel={onClose}
      okText="Create"
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" className="!text-sm">
        Creates a machine identity with one key. The key is shown once, right after creation.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input placeholder="e.g. ci-bot" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RenameModal({
  teamId,
  sa,
  open,
  onClose,
}: {
  teamId: string;
  sa: ServiceAccountRow;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await renameServiceAccount(teamId, sa.id, v.name);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Renamed");
        onClose();
        router.refresh();
      }),
    );

  return (
    <Modal
      title="Rename service account"
      open={open}
      onCancel={onClose}
      okText="Save"
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ name: sa.name }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
          <Input autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ManageKeysModal({
  teamId,
  sa,
  open,
  onClose,
  onReveal,
}: {
  teamId: string;
  sa: ServiceAccountRow;
  open: boolean;
  onClose: () => void;
  onReveal: (key: string) => void;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [keys, setKeys] = useState<ServiceAccountKeyInfo[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [mutating, startMutate] = useTransition();

  const reload = () =>
    startLoad(async () => {
      const r = await listServiceAccountKeys(teamId, sa.id);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      setKeys(r.keys);
    });

  useEffect(() => {
    if (!open) return;
    setKeys(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sa.id]);

  const addKey = () =>
    startMutate(async () => {
      const r = await addServiceAccountKey(teamId, sa.id);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      onReveal(r.key);
      reload();
      router.refresh();
    });

  const revoke = (keyId: string) =>
    startMutate(async () => {
      const r = await revokeServiceAccountKey(teamId, keyId);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Key revoked");
      reload();
      router.refresh();
    });

  const columns: ColumnsType<ServiceAccountKeyInfo> = [
    {
      title: "Key",
      dataIndex: "hint",
      render: (hint: string) => <Typography.Text code>{hint}</Typography.Text>,
    },
    {
      title: "Last used",
      dataIndex: "lastUsedAt",
      width: 130,
      render: (v: string | null) => (
        <span className="text-sm text-gray-500">{v ? timeAgo(v) : "Never"}</span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, k) => (
        <Popconfirm
          title="Revoke this key?"
          description="Anything using it stops working immediately."
          okText="Revoke"
          okButtonProps={{ danger: true }}
          onConfirm={() => revoke(k.id)}
        >
          <Button type="text" danger size="small" loading={mutating}>
            Revoke
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={`Keys — ${sa.name}`}
      open={open}
      onCancel={onClose}
      width={620}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="add" type="primary" icon={<PlusOutlined />} loading={mutating} onClick={addKey}>
          Generate key
        </Button>,
      ]}
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading && !keys}
        columns={columns}
        dataSource={keys ?? []}
        pagination={false}
        locale={{ emptyText: "No keys" }}
      />
    </Modal>
  );
}

function RevealKeyModal({ token, onClose }: { token: string | null; onClose: () => void }) {
  return (
    <Modal
      title="Save this key now"
      open={!!token}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="done" type="primary" onClick={onClose}>
          Done
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        className="!mb-3"
        message="This is the only time the key is shown. Store it somewhere safe."
      />
      {token && (
        <div className="group rounded-lg border border-gray-200 bg-gray-50 p-3">
          <CopyId value={token} />
        </div>
      )}
    </Modal>
  );
}
