"use client";

import { App, Button, Card, Form, Input, Typography } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createScope } from "../actions";
import { Page } from "@/ui/components/Page";
import { DetailHeader } from "@/ui/components/DetailHeader";
import { useCurrentTeam } from "@/ui/components/TeamContext";

export default function NewPublishedMcpPage() {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const submit = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await createScope(teamId, v.name, v.slug ?? "");
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Bundle created");
        router.replace(`/${teamSlug}/published/${r.id}`);
      }),
    );

  return (
    <Page
      breadcrumb={[
        { title: "Bundled MCPs", href: `/${teamSlug}/published` },
        { title: "New" },
      ]}
    >
      <DetailHeader
        icon={<AppstoreOutlined />}
        title="New bundle"
        subtitle="An endpoint that exposes a set of member MCPs and vaults"
        backHref={`/${teamSlug}/published`}
        backLabel="All bundled MCPs"
      />

      <div className="max-w-[560px]">
        <Card title="Properties">
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
              <Input placeholder="e.g. Public" autoFocus />
            </Form.Item>
            <Form.Item
              name="slug"
              label="Id (path segment)"
              extra="Served at /team/<id>. Letters, digits and underscore only; defaults from the name."
            >
              <Input placeholder="e.g. public" />
            </Form.Item>
            <Typography.Paragraph type="secondary" className="!text-sm">
              After creating it, add member MCPs and groups on the next page.
            </Typography.Paragraph>
            <div className="flex gap-2">
              <Button type="primary" loading={pending} onClick={submit}>
                Create
              </Button>
              <Button onClick={() => router.push(`/${teamSlug}/published`)}>Cancel</Button>
            </div>
          </Form>
        </Card>
      </div>
    </Page>
  );
}
