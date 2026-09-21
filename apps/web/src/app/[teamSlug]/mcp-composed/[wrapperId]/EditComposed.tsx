"use client";

import { Alert, App, Button, Card, Form, Input, List, Select, Typography } from "antd";
import { ApiOutlined, DeploymentUnitOutlined, KeyOutlined, ThunderboltOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateWrapper, testWrapper, deleteWrapper } from "../actions";
import { typeLabel } from "../constants";
import type { CredentialOption } from "../ComposedTable";
import { DetailHeader } from "../../../DetailHeader";
import { Page } from "../../../Page";
import { StatusPill, type Tone } from "../../../StatusPill";
import { useCurrentTeam } from "../../../TeamContext";
import { timeAgo } from "@/lib/timeAgo";

type ToolInfo = { name: string; description?: string };

type Wrapper = {
  id: string;
  name: string;
  slug: string;
  type: string;
  credentialIds: string[];
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  updatedAt: string;
};

function health(ok: boolean | null): { tone: Tone; label: string } {
  if (ok === null) return { tone: "default", label: "Untested" };
  return ok ? { tone: "success", label: "Healthy" } : { tone: "error", label: "Error" };
}

export function EditComposed({
  wrapper,
  credentials,
}: {
  wrapper: Wrapper;
  credentials: CredentialOption[];
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const test = () =>
    startTest(async () => {
      const r = await testWrapper(teamId, wrapper.id);
      if ("error" in r) {
        setTools(null);
        setInstructions(null);
        message.error(r.error);
        router.refresh();
        return;
      }
      setTools(r.tools);
      setInstructions(r.instructions ?? null);
      message.success(`${r.realmCount} company(ies) resolved · ${r.tools.length} tool(s)`);
      router.refresh();
    });

  const save = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await updateWrapper(teamId, wrapper.id, v.name, v.slug, v.credentialIds ?? []);
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
      await deleteWrapper(teamId, wrapper.id);
      message.success("Composed MCP deleted");
      router.push(`/${teamSlug}/mcp-composed`);
    });

  const h = health(wrapper.lastTestOk);
  const credCount = wrapper.credentialIds.length;

  return (
    <Page
      breadcrumb={[{ title: "Composed MCPs", href: `/${teamSlug}/mcp-composed` }, { title: wrapper.name }]}
    >
      <DetailHeader
        icon={<DeploymentUnitOutlined />}
        title={wrapper.name}
        subtitle={`${typeLabel(wrapper.type)} · ${credCount} ${credCount === 1 ? "credential" : "credentials"}`}
        tag={<StatusPill tone={h.tone} label={h.label} />}
        backHref={`/${teamSlug}/mcp-composed`}
        backLabel="All composed MCPs"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card title="Configuration">
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={{
                name: wrapper.name,
                slug: wrapper.slug,
                credentialIds: wrapper.credentialIds,
              }}
            >
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input autoFocus />
              </Form.Item>
              <Form.Item label="Type" extra="Fixed after creation.">
                <Input value={typeLabel(wrapper.type)} disabled />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Id"
                extra="Letters, digits and underscore only. Tools are served as <id>__tool."
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="credentialIds"
                label="Credentials"
                extra={
                  credentials.length
                    ? "Each QuickBooks credential adds a company (realm) this MCP can act on."
                    : (
                        <>
                          No credentials yet — <Link href={`/${teamSlug}`}>add one</Link>.
                        </>
                      )
                }
              >
                <Select
                  mode="multiple"
                  placeholder={credentials.length ? "Attach credentials" : "No credentials yet"}
                  options={credentials.map((c) => ({ value: c.id, label: `${c.name} · ${c.vaultName}` }))}
                  optionFilterProp="label"
                />
              </Form.Item>
              <div className="flex items-center gap-2">
                <Button type="primary" loading={pending} onClick={save}>
                  Save changes
                </Button>
                <Button onClick={() => form.resetFields()}>Cancel</Button>
                <span className="ml-auto text-xs text-gray-400">Saved {timeAgo(wrapper.updatedAt)}</span>
              </div>
            </Form>
          </Card>

          {(tools || instructions) && (
            <Card title="Tools">
              {instructions && (
                <div className="mb-3">
                  <Typography.Text strong>Instructions</Typography.Text>
                  <div className="prose prose-sm mt-1 max-h-80 max-w-none overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <Markdown remarkPlugins={[remarkGfm]}>{instructions}</Markdown>
                  </div>
                </div>
              )}
              {tools && (
                <List
                  size="small"
                  bordered
                  header={<Typography.Text strong>{tools.length} tool(s)</Typography.Text>}
                  dataSource={tools}
                  locale={{ emptyText: "No tools yet" }}
                  renderItem={(t) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<ApiOutlined aria-hidden />}
                        title={<Typography.Text code>{t.name}</Typography.Text>}
                        description={t.description}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Test">
            <Typography.Paragraph type="secondary" className="!text-sm">
              Resolves the attached credentials to companies and builds the MCP. No tools are implemented
              yet, so a healthy result reports 0 tools.
            </Typography.Paragraph>
            {wrapper.lastTestOk === true && (
              <Alert
                type="success"
                showIcon
                message={`Last test passed · ${timeAgo(wrapper.lastTestedAt)}`}
                className="!mb-3"
              />
            )}
            {wrapper.lastTestOk === false && (
              <Alert
                type="error"
                showIcon
                message={wrapper.lastTestError || "Last test failed"}
                className="!mb-3"
              />
            )}
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={testing}
              onClick={test}
              disabled={credCount === 0}
              block
            >
              <span className="inline-flex items-center gap-1">
                <KeyOutlined aria-hidden />
                Test
              </span>
            </Button>
          </Card>

          <Card className="!border-red-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-red-600">Delete composed MCP</div>
                <div className="text-xs text-gray-500">Agents using it lose access immediately.</div>
              </div>
              <Button danger loading={deleting} onClick={remove}>
                Delete
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
