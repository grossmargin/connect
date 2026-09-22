"use client";

import { App, Button, Form, Input, Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteVault, updateVault } from "./actions";
import { useCurrentTeam } from "@/ui/components/TeamContext";

export function PropertiesTab({
  vaultId,
  name,
  description,
}: {
  vaultId: string;
  name: string;
  description: string | null;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await updateVault(teamId, vaultId, v.name, v.description ?? "");
        if (r && "error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Saved");
        router.refresh();
      }),
    );

  const remove = () =>
    startDelete(async () => {
      const r = await deleteVault(teamId, vaultId);
      if (r && "error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Vault deleted");
      router.push(`/${teamSlug}`);
    });

  return (
    <div className="max-w-md">
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ name, description: description ?? "" }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Button type="primary" loading={pending} onClick={submit}>
          Save
        </Button>
      </Form>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <div className="mb-2 text-sm font-medium text-gray-900">Danger zone</div>
        <p className="mb-3 text-sm text-gray-500">
          Deleting a vault permanently removes it and every credential it holds.
        </p>
        <Popconfirm
          title="Delete this vault?"
          description="This removes the vault and all its credentials. This cannot be undone."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={remove}
        >
          <Button danger icon={<DeleteOutlined />} loading={deleting}>
            Delete vault
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}
