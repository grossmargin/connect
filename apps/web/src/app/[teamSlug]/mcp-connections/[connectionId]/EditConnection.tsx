"use client";

import { Alert, App, Button, Card, Dropdown, Form, Input, List, Typography } from "antd";
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  CodeOutlined,
  DownOutlined,
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
import { DetailHeader } from "@/ui/components/DetailHeader";
import { Page } from "@/ui/components/Page";
import { StatusPill } from "@/ui/components/StatusPill";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";
import { packageFromSentinelUrl } from "@/lib/isomorphic/localMcpPackages";

type ToolInfo = { name: string; description?: string };
type Usage = { scopeId: string; label: string };

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
  usages: Usage[];
};

function host(url: string): string {
  const pkg = packageFromSentinelUrl(url);
  if (pkg) return `local · ${pkg}`;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function EditConnection({ connection }: { connection: Connection }) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
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
  // Only OAuth (DCR) connections have an authorize step. Header- and local
  // (stdio) connections carry their configuration from the start, so Test can
  // run immediately.
  const isOAuth = connection.authType === "DCR";
  const isLocal = connection.authType === "STDIO";
  const localPackage = packageFromSentinelUrl(connection.url);
  const notAuthorized = isOAuth && (connection.status === "PENDING" || connection.status === "REGISTERED");

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

  // rotate=false reuses the existing client (non-destructive); rotate=true
  // registers a fresh one, de-registering the old. See startAuthorize.
  const authorize = (rotate: boolean) =>
    startAuth(async () => {
      const r = await startAuthorize(teamId, connection.id, rotate);
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
      router.push(`/${teamSlug}/mcp-connections`);
    });

  const tag = STATUS_TAG[connection.status];

  return (
    <Page
      breadcrumb={[
        { title: "MCP Connections", href: `/${teamSlug}/mcp-connections` },
        { title: connection.name },
      ]}
    >
      <DetailHeader
        icon={<ApiOutlined />}
        title={connection.name}
        subtitle={`Connection · ${host(connection.url)}`}
        tag={<StatusPill tone={tag.tone} label={tag.label} />}
        backHref={`/${teamSlug}/mcp-connections`}
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
              <Form.Item label={isLocal ? "Local package" : "Server URL"}>
                <Input value={isLocal ? (localPackage ?? connection.url) : connection.url} readOnly disabled />
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
            {connection.authType === "HEADERS" && (
              <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-sm">
                Authenticates with stored headers. Run <Typography.Text code>Test</Typography.Text> to verify them.
              </Typography.Paragraph>
            )}
            {isLocal && (
              <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-sm">
                Runs the <Typography.Text code>{localPackage}</Typography.Text> package in a worker thread. Run{" "}
                <Typography.Text code>Test</Typography.Text> to start it and load its tools.
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
              {isOAuth &&
                (connection.status === "PENDING" ? (
                  // No client registered yet: the only action is to register + authorize.
                  <Button
                    icon={<SafetyOutlined />}
                    loading={authorizing}
                    onClick={() => authorize(true)}
                    className="flex-1"
                  >
                    Authorize
                  </Button>
                ) : (
                  <Dropdown.Button
                    className="flex-1"
                    icon={<DownOutlined />}
                    loading={authorizing}
                    onClick={() => authorize(false)}
                    menu={{
                      items: [
                        {
                          key: "rotate",
                          icon: <SafetyOutlined />,
                          label:
                            connection.status === "ERROR"
                              ? "Rotate client (fixes a broken connection)"
                              : "Rotate client & authorize",
                          onClick: () => authorize(true),
                        },
                      ],
                    }}
                  >
                    <SafetyOutlined /> {connection.status === "CONNECTED" ? "Re-authorize" : "Authorize"}
                  </Dropdown.Button>
                ))}
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

          <Card title="Published in">
            {connection.usages.length === 0 ? (
              <Typography.Text type="secondary" className="!text-sm">
                Not part of any bundle yet.
              </Typography.Text>
            ) : (
              <>
                <ul className="m-0 list-none space-y-2 p-0">
                  {connection.usages.map((u, i) => (
                    <li key={`${u.scopeId}-${i}`}>
                      <Link
                        href={`/${teamSlug}/published/${u.scopeId}`}
                        className="flex items-center gap-2 text-gray-700 hover:text-indigo-600"
                      >
                        <AppstoreOutlined className="text-gray-400" />
                        <span className="flex-1">{u.label}</span>
                        <ArrowRightOutlined className="text-gray-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-xs">
                  Removing this connection affects {connection.usages.length}{" "}
                  {connection.usages.length === 1 ? "place" : "places"}.
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
