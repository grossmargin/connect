"use client";

import { Alert, App, Button, Card, Form, Input, List, Typography } from "antd";
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  CodeOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { updateConnection, startAuthorize, testConnection, deleteConnection } from "../actions";
import { ConnectionTechModal } from "../ConnectionTechModal";
import { STATUS_TAG, type ConnectionStatus } from "../status";
import { DetailHeader } from "../../../DetailHeader";
import { Page } from "../../../Page";
import { StatusPill } from "../../../StatusPill";
import { timeAgo } from "@/lib/timeAgo";

type ToolInfo = { name: string; description?: string };
type ToolsetRef = { id: string; name: string; slug: string };

type Connection = {
  id: string;
  name: string;
  slug: string;
  url: string;
  authType: string;
  status: ConnectionStatus;
  lastError: string | null;
  lastConnectedAt: string | null;
  lastTestedAt: string | null;
  toolsets: ToolsetRef[];
};

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function EditConnection({ teamId, connection }: { teamId: string; connection: Connection }) {
  const router = useRouter();
  const { message } = App.useApp();
  const searchParams = useSearchParams();
  const [form] = Form.useForm();
  const [saving, startSave] = useTransition();
  const [authorizing, startAuth] = useTransition();
  const [testing, startTest] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  const authorized = searchParams.get("authorized") === "1";
  const callbackError = searchParams.get("error");
  // Token-based connections carry their credentials from the start — there's no
  // OAuth authorize step, and Test can run immediately.
  const isHeaders = connection.authType === "HEADERS";
  const notAuthorized = !isHeaders && (connection.status === "PENDING" || connection.status === "REGISTERED");

  const save = () =>
    form.validateFields().then((v) =>
      startSave(async () => {
        const r = await updateConnection(teamId, connection.id, v.name, v.slug);
        if (r && "error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Saved");
        router.refresh();
      }),
    );

  const authorize = () =>
    startAuth(async () => {
      const r = await startAuthorize(teamId, connection.id);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      window.location.assign(r.url);
    });

  const test = () =>
    startTest(async () => {
      const r = await testConnection(teamId, connection.id);
      if ("error" in r) {
        setTools(null);
        setInstructions(null);
        message.error(r.error);
        router.refresh();
        return;
      }
      setTools(r.tools);
      setInstructions(r.instructions ?? null);
      message.success(`Loaded ${r.tools.length} tool(s)`);
      router.refresh();
    });

  const remove = () =>
    startDelete(async () => {
      await deleteConnection(teamId, connection.id);
      message.success("Connection deleted");
      router.push(`/${teamId}/mcp-connections`);
    });

  const tag = STATUS_TAG[connection.status];

  return (
    <Page
      breadcrumb={[
        { title: "MCP Connections", href: `/${teamId}/mcp-connections` },
        { title: connection.name },
      ]}
    >
      <DetailHeader
        icon={<ApiOutlined />}
        title={connection.name}
        subtitle={`Connection · ${host(connection.url)}`}
        tag={<StatusPill tone={tag.tone} label={tag.label} />}
        backHref={`/${teamId}/mcp-connections`}
        backLabel="All connections"
      />

      {authorized && <Alert type="success" showIcon message="Authorized" className="!mb-4" />}
      {callbackError && (
        <Alert type="error" showIcon message={`Authorization failed: ${callbackError}`} className="!mb-4" />
      )}
      {connection.status === "ERROR" && connection.lastError && (
        <Alert type="error" showIcon message={connection.lastError} className="!mb-4" />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card title="Properties">
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={{ name: connection.name, slug: connection.slug }}
            >
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Id"
                extra="Letters, digits and underscore only. Other characters become underscores."
              >
                <Input />
              </Form.Item>
              <Form.Item label="Server URL">
                <Input value={connection.url} readOnly disabled />
              </Form.Item>
              <div className="flex gap-2">
                <Button type="primary" loading={saving} onClick={save}>
                  Save changes
                </Button>
                <Button onClick={() => form.resetFields()}>Cancel</Button>
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
          <Card title="Connection">
            <dl className="m-0 space-y-2 text-sm">
              <Row label="Status" value={<StatusPill tone={tag.tone} label={tag.label} />} />
              <Row label="Last tested" value={timeAgo(connection.lastTestedAt) ?? "Never"} />
              <Row label="Last connected" value={timeAgo(connection.lastConnectedAt) ?? "Never"} />
            </dl>
            {notAuthorized && (
              <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-sm">
                Authorize this connection to run <Typography.Text code>tools/list</Typography.Text>.
              </Typography.Paragraph>
            )}
            {isHeaders && (
              <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-sm">
                Authenticates with stored headers. Run <Typography.Text code>Test</Typography.Text> to verify them.
              </Typography.Paragraph>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={testing}
                onClick={test}
                disabled={notAuthorized}
                className="flex-1"
              >
                Test
              </Button>
              {!isHeaders && (
                <Button icon={<SafetyOutlined />} loading={authorizing} onClick={authorize} className="flex-1">
                  {connection.status === "CONNECTED" ? "Re-authorize" : "Authorize"}
                </Button>
              )}
            </div>
            <Button
              icon={<CodeOutlined />}
              onClick={() => setTechOpen(true)}
              block
              className="!mt-2"
            >
              Technical details
            </Button>
          </Card>

          <Card title="Used in toolsets">
            {connection.toolsets.length === 0 ? (
              <Typography.Text type="secondary" className="!text-sm">
                Not used in any toolset yet.
              </Typography.Text>
            ) : (
              <>
                <ul className="m-0 list-none space-y-2 p-0">
                  {connection.toolsets.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/${teamId}/mcp-toolsets/${t.id}`}
                        className="flex items-center gap-2 text-gray-700 hover:text-indigo-600"
                      >
                        <AppstoreOutlined className="text-gray-400" />
                        <span className="flex-1">{t.name}</span>
                        <ArrowRightOutlined className="text-gray-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-xs">
                  Removing this connection affects {connection.toolsets.length}{" "}
                  {connection.toolsets.length === 1 ? "toolset" : "toolsets"}.
                </Typography.Paragraph>
              </>
            )}
          </Card>

          <Card className="!border-red-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-red-600">Delete connection</div>
                <div className="text-xs text-gray-500">Revokes the token and removes it from toolsets.</div>
              </div>
              <Button danger loading={deleting} onClick={remove}>
                Delete
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ConnectionTechModal
        teamId={teamId}
        connectionId={connection.id}
        connectionName={connection.name}
        open={techOpen}
        onClose={() => setTechOpen(false)}
      />
    </Page>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="m-0 text-gray-900">{value}</dd>
    </div>
  );
}
