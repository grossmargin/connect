"use client";

import { App, Button, Form, Input, Modal } from "antd";
import { ArrowRightOutlined, FolderOpenOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createVault } from "../actions";
import { Page, PageIntro } from "../Page";
import { timeAgo } from "@/lib/timeAgo";

type Vault = {
  id: string;
  name: string;
  description: string | null;
  secretCount: number;
  updatedAt: string;
};

export function VaultsGrid({ teamId, vaults }: { teamId: string; vaults: Vault[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Page breadcrumb={[{ title: "Vaults" }]}>
      <PageIntro
        title="Vaults"
        description="Encrypted stores for the credentials your MCP servers use. Access is granted per vault."
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New vault
          </Button>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {vaults.map((v) => (
          <button
            key={v.id}
            onClick={() => router.push(`/${teamId}/vaults/${v.id}`)}
            className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <FolderOpenOutlined />
              </span>
              <ArrowRightOutlined className="-rotate-45 text-gray-300 group-hover:text-indigo-500" />
            </div>
            <div className="mt-3 font-semibold text-gray-900">{v.name}</div>
            <div className="mt-1 min-h-[20px] text-sm text-gray-500">
              {v.description || <span className="text-gray-400">No description</span>}
            </div>
            <div className="mt-4 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-400">
              <KeyOutlined />
              {v.secretCount} {v.secretCount === 1 ? "secret" : "secrets"}
              <span className="px-1">·</span>
              Updated {timeAgo(v.updatedAt)}
            </div>
          </button>
        ))}

        <button
          onClick={() => setOpen(true)}
          className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 bg-transparent p-5 text-gray-500 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          <PlusOutlined className="text-lg" />
          <span className="font-medium text-gray-700">New vault</span>
          <span className="text-xs text-gray-400">Store a new set of credentials</span>
        </button>
      </div>

      <NewVaultModal teamId={teamId} open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

function NewVaultModal({ teamId, open, onClose }: { teamId: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  return (
    <Modal
      title="New vault"
      open={open}
      onCancel={onClose}
      okText="Create"
      confirmLoading={pending}
      onOk={() =>
        form.validateFields().then((v) =>
          start(async () => {
            await createVault(teamId, v.name, v.description ?? "");
            message.success("Vault created");
          }),
        )
      }
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. Production" autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
