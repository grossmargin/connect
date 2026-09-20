"use client";

import { App, Button, Empty, Form, Input, List, Modal, Select, Tag, Typography } from "antd";
import { EditOutlined, EyeOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCredential, updateCredential, revealCredential } from "./actions";

export type Cred = {
  id: string;
  name: string;
  description: string | null;
  type: "SINGLELINE" | "MULTILINE" | "NANGO";
  credentialRef?: { connectionId?: string; providerConfigKey?: string } | null;
};

const TYPE_TAG: Record<Cred["type"], { color: string; label: string }> = {
  SINGLELINE: { color: "default", label: "single-line" },
  MULTILINE: { color: "geekblue", label: "multi-line" },
  NANGO: { color: "green", label: "nango" },
};

export function CredentialsTab({ vaultId, credentials }: { vaultId: string; credentials: Cred[] }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Cred | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (c: Cred) => {
    setEditing(c);
    setEditorOpen(true);
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New credential
        </Button>
      </div>

      {credentials.length === 0 ? (
        <Empty description="No credentials yet" />
      ) : (
        <List
          bordered
          dataSource={credentials}
          renderItem={(c) => (
            <List.Item actions={[<RevealButton key="r" cred={c} />, <Button key="e" type="link" icon={<EditOutlined />} onClick={() => openEdit(c)}>Edit</Button>]}>
              <List.Item.Meta
                avatar={<KeyOutlined style={{ fontSize: 18 }} aria-hidden />}
                title={
                  <span className="inline-flex items-center gap-2">
                    {c.name}
                    <Tag color={TYPE_TAG[c.type].color}>{TYPE_TAG[c.type].label}</Tag>
                  </span>
                }
                description={c.description}
              />
            </List.Item>
          )}
        />
      )}

      <CredentialEditor
        vaultId={vaultId}
        cred={editing}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}

function RevealButton({ cred }: { cred: Cred }) {
  const { message } = App.useApp();
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reveal = () =>
    start(async () => {
      const r = await revealCredential(cred.id);
      if ("value" in r) setValue(r.value);
      else message.error(r.error);
    });

  return (
    <>
      <Button type="link" icon={<EyeOutlined />} loading={pending} onClick={reveal}>
        Reveal
      </Button>
      <Modal title={cred.name} open={value !== null} onCancel={() => setValue(null)} footer={null}>
        <Typography.Paragraph type="secondary" className="!text-xs">
          This reveal was recorded in the audit log.
        </Typography.Paragraph>
        <Input.TextArea
          readOnly
          value={value ?? ""}
          autoSize={{ minRows: 1, maxRows: 12 }}
          className="font-mono"
        />
        <Typography.Paragraph copyable={{ text: value ?? "" }} className="!mt-2 !mb-0">
          Copy value
        </Typography.Paragraph>
      </Modal>
    </>
  );
}

function CredentialEditor({
  vaultId,
  cred,
  open,
  onClose,
}: {
  vaultId: string;
  cred: Cred | null;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const type = Form.useWatch("type", form) ?? cred?.type ?? "SINGLELINE";
  const isNango = type === "NANGO";

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const fd = new FormData();
        fd.set("name", v.name);
        fd.set("description", v.description ?? "");
        fd.set("type", v.type);
        if (v.type === "NANGO") {
          fd.set("connectionId", v.connectionId ?? "");
          fd.set("providerConfigKey", v.providerConfigKey ?? "");
        } else {
          fd.set("value", v.value ?? "");
        }
        if (cred) await updateCredential(cred.id, fd);
        else await createCredential(vaultId, fd);
        message.success(cred ? "Saved" : "Created");
        onClose();
        router.refresh();
      }),
    );

  return (
    <Modal
      title={cred ? "Edit credential" : "New credential"}
      open={open}
      onCancel={onClose}
      okText={cred ? "Save" : "Create"}
      confirmLoading={pending}
      onOk={submit}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{
          name: cred?.name,
          description: cred?.description ?? "",
          type: cred?.type ?? "SINGLELINE",
          connectionId: cred?.credentialRef?.connectionId ?? "",
          providerConfigKey: cred?.credentialRef?.providerConfigKey ?? "quickbooks",
        }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item name="type" label="Type">
          <Select
            options={[
              { value: "SINGLELINE", label: "Single line" },
              { value: "MULTILINE", label: "Multi line" },
              { value: "NANGO", label: "Nango (dynamic OAuth token)" },
            ]}
          />
        </Form.Item>
        {isNango ? (
          <>
            <Form.Item
              name="connectionId"
              label="Nango connection ID"
              rules={[{ required: true, message: "Enter the Nango connection ID" }]}
            >
              <Input placeholder="e.g. quickbooks realmId or a company slug" />
            </Form.Item>
            <Form.Item
              name="providerConfigKey"
              label="Provider config key"
              rules={[{ required: true, message: "Enter the provider config key" }]}
            >
              <Input placeholder="quickbooks" />
            </Form.Item>
          </>
        ) : (
          <Form.Item
            name="value"
            label={cred ? "New secret value" : "Secret value"}
            extra={cred ? "Leave blank to keep the current value." : undefined}
            rules={cred ? [] : [{ required: true, message: "Enter the secret value" }]}
          >
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 10 }} className="font-mono" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
