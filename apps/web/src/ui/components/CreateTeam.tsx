"use client";

import { App, Button, Form, Input, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createTeamAction } from "@/app/actions";

// Shared create-team form. On success it navigates to the new team. Used inline
// on the onboarding page and inside the modal in the team switcher.
export function CreateTeamForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createTeamAction(v.name);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Team created");
        onDone?.();
        router.push(`/${r.slug}`);
        router.refresh();
      }),
    );

  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
      <Form.Item name="name" label="Team name" rules={[{ required: true, message: "Enter a team name" }]}>
        <Input placeholder="e.g. Acme" autoFocus />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={pending} block>
        Create team
      </Button>
    </Form>
  );
}

export function CreateTeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal title="New team" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <CreateTeamForm onDone={onClose} />
    </Modal>
  );
}
