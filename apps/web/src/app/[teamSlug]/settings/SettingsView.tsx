"use client";

import { App, Button, Card, Form, Input, Table, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { KeyOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { updateTeamSlug } from "./actions";
import { ServiceAccountsTab, type ServiceAccountRow } from "./ServiceAccountsTab";
import { CopyId } from "../../CopyId";
import { Page, PageIntro } from "../../Page";
import { useCurrentTeam } from "../../TeamContext";
import { timeAgo } from "@/lib/timeAgo";

export type { ServiceAccountRow };

export type MemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
};

const TABS = ["general", "members", "service-accounts"] as const;
type TabKey = (typeof TABS)[number];

function roleColor(role: string): string {
  const r = role.toUpperCase();
  if (r === "ADMIN" || r === "OWNER") return "geekblue";
  if (r === "MEMBER") return "green";
  return "default";
}

export function SettingsView({
  teamName,
  slug,
  members,
  serviceAccounts,
}: {
  teamName: string;
  slug: string;
  members: MemberRow[];
  serviceAccounts: ServiceAccountRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { teamId } = useCurrentTeam();

  const param = searchParams.get("tab");
  const active: TabKey = TABS.includes(param as TabKey) ? (param as TabKey) : "general";

  const setTab = (key: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", key);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <Page breadcrumb={[{ title: "Team Settings" }]}>
      <PageIntro title="Team Settings" description={`Settings for ${teamName}.`} />

      <Tabs
        activeKey={active}
        onChange={setTab}
        items={[
          {
            key: "general",
            label: (
              <span>
                <SettingOutlined /> General
              </span>
            ),
            children: <GeneralTab teamId={teamId} teamName={teamName} slug={slug} />,
          },
          {
            key: "members",
            label: (
              <span>
                <TeamOutlined /> Members
              </span>
            ),
            children: <MembersTab members={members} />,
          },
          {
            key: "service-accounts",
            label: (
              <span>
                <KeyOutlined /> Service accounts
              </span>
            ),
            children: <ServiceAccountsTab accounts={serviceAccounts} />,
          },
        ]}
      />
    </Page>
  );
}

function GeneralTab({ teamId, teamName, slug }: { teamId: string; teamName: string; slug: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();

  const save = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await updateTeamSlug(teamId, v.slug);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Team id updated");
        router.push(`/${r.slug}/settings`);
        router.refresh();
      }),
    );

  return (
    <div className="max-w-xl">
      <Card title="Team">
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ slug }}>
          <Form.Item label="Name">
            <Input value={teamName} readOnly disabled />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Team id"
            extra="Used in URLs and as this team's MCP endpoint. Letters, digits and underscore only; other characters become underscores."
            rules={[{ required: true, message: "Enter a team id" }]}
          >
            <Input prefix={<span className="text-gray-400">/</span>} />
          </Form.Item>
          <Form.Item label="MCP endpoint">
            <CopyId value={`/${slug}`} />
          </Form.Item>
          <Button type="primary" loading={pending} onClick={save}>
            Save changes
          </Button>
        </Form>
      </Card>
    </div>
  );
}

function MembersTab({ members }: { members: MemberRow[] }) {
  const columns: ColumnsType<MemberRow> = [
    {
      title: "Member",
      key: "member",
      render: (_, m) => (
        <div className="leading-tight">
          <div className="font-medium text-gray-900">{m.name || m.email}</div>
          {m.name && <div className="text-xs text-gray-400">{m.email}</div>}
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      width: 160,
      render: (role: string) => <Tag color={roleColor(role)}>{role}</Tag>,
    },
    {
      title: "Joined",
      dataIndex: "joinedAt",
      width: 160,
      render: (v: string) => <span className="text-sm text-gray-500">{timeAgo(v)}</span>,
    },
  ];

  return (
    <>
      <Typography.Paragraph type="secondary" className="!text-sm">
        People with access to this team. Read-only for now.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={members}
        pagination={false}
        locale={{ emptyText: "No members" }}
      />
    </>
  );
}
