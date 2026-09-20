"use client";

import { App, Button, Form, Input } from "antd";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateVault } from "./actions";

export function PropertiesTab({
  teamId,
  vaultId,
  name,
  description,
}: {
  teamId: string;
  vaultId: string;
  name: string;
  description: string | null;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

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
    </div>
  );
}
