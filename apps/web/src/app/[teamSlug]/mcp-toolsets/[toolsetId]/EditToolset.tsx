"use client";

import { Alert, App, Button, Card, Form, Input, List, Select, Typography } from "antd";
import { ApiOutlined, AppstoreOutlined, ThunderboltOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateToolset, testToolset, deleteToolset } from "../actions";
import type { ConnectionOption } from "../ToolsetsTable";
import { DetailHeader } from "../../../DetailHeader";
import { Page } from "../../../Page";
import { StatusPill, type Tone } from "../../../StatusPill";
import { timeAgo } from "@/lib/timeAgo";

type ToolInfo = { name: string; description?: string };

type Toolset = {
  id: string;
  name: string;
  slug: string;
  connectionIds: string[];
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  updatedAt: string;
};

function health(ok: boolean | null): { tone: Tone; label: string } {
  if (ok === null) return { tone: "default", label: "Untested" };
  return ok ? { tone: "success", label: "Healthy" } : { tone: "error", label: "Error" };
}

export function EditToolset({
  teamId,
  toolset,
  connections,
}: {
  teamId: string;
  toolset: Toolset;
  connections: ConnectionOption[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const test = () =>
    startTest(async () => {
      const r = await testToolset(teamId, toolset.id);
      if ("error" in r) {
        setTools(null);
        setInstructions(null);
        message.error(r.error);
        router.refresh();
        return;
      }
      setTools(r.tools);
      setInstructions(r.instructions ?? null);
      message.success(`${r.memberCount} server(s) agree on ${r.tools.length} tool(s)`);
      router.refresh();
    });

  const save = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await updateToolset(teamId, toolset.id, v.name, v.slug, v.connectionIds ?? []);
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
      await deleteToolset(teamId, toolset.id);
      message.success("Federated MCP deleted");
      router.push(`/${teamId}/mcp-toolsets`);
    });

  const h = health(toolset.lastTestOk);
  const serverCount = toolset.connectionIds.length;

  return (
    <Page
      breadcrumb={[{ title: "Federated MCPs", href: `/${teamId}/mcp-toolsets` }, { title: toolset.name }]}
    >
      <DetailHeader
        icon={<AppstoreOutlined />}
        title={toolset.name}
        subtitle={`Federated · ${serverCount} ${serverCount === 1 ? "server" : "servers"}`}
        tag={<StatusPill tone={h.tone} label={h.label} />}
        backHref={`/${teamId}/mcp-toolsets`}
        backLabel="All federated MCPs"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card title="Configuration">
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={{
                name: toolset.name,
                slug: toolset.slug,
                connectionIds: toolset.connectionIds,
              }}
            >
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input autoFocus />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Id"
                extra="Letters, digits and underscore only. Other characters become underscores."
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="connectionIds"
                label="MCP servers"
                extra={
                  connections.length
                    ? "All servers must expose the same tools. Instructions are taken from the first."
                    : (
                        <>
                          No connections yet — <Link href={`/${teamId}/mcp-connections`}>add one</Link>.
                        </>
                      )
                }
              >
                <Select
                  mode="multiple"
                  placeholder={connections.length ? "Pick servers to include" : "No connections yet"}
                  options={connections.map((c) => ({ value: c.id, label: c.name }))}
                  optionFilterProp="label"
                />
              </Form.Item>
              <div className="flex items-center gap-2">
                <Button type="primary" loading={pending} onClick={save}>
                  Save changes
                </Button>
                <Button onClick={() => form.resetFields()}>Cancel</Button>
                <span className="ml-auto text-xs text-gray-400">Saved {timeAgo(toolset.updatedAt)}</span>
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
                  locale={{ emptyText: "No tools returned" }}
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
              Connects to every server, checks they expose the same tools, and takes the instructions from
              the first.
            </Typography.Paragraph>
            {toolset.lastTestOk === true && (
              <Alert
                type="success"
                showIcon
                message={`Last test passed · ${timeAgo(toolset.lastTestedAt)}`}
                className="!mb-3"
              />
            )}
            {toolset.lastTestOk === false && (
              <Alert
                type="error"
                showIcon
                message={toolset.lastTestError || "Last test failed"}
                className="!mb-3"
              />
            )}
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={testing}
              onClick={test}
              disabled={serverCount === 0}
              block
            >
              Test connection
            </Button>
          </Card>

          <Card className="!border-red-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-red-600">Delete federated MCP</div>
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
