"use client";

import { App, Button, Card, Form, Input, Modal, Popconfirm, Table, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  KeyOutlined,
  LinkOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTeamSlug, inviteMember, revokeInvitation, getInvitationLink } from "./actions";
import { ServiceAccountsTab, type ServiceAccountRow } from "./ServiceAccountsTab";
import { CopyId } from "@/ui/components/CopyId";
import { Page, PageIntro } from "@/ui/components/Page";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { timeAgo } from "@/lib/isomorphic/timeAgo";

export type { ServiceAccountRow };

export type MemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
};

export type InvitationRow = {
  id: string;
  email: string;
  acceptedAt: string | null;
  createdAt: string;
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
  invitations,
  serviceAccounts,
}: {
  teamName: string;
  slug: string;
  members: MemberRow[];
  invitations: InvitationRow[];
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
            children: <MembersTab members={members} invitations={invitations} />,
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

function MembersTab({ members, invitations }: { members: MemberRow[]; invitations: InvitationRow[] }) {
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
    <div className="flex flex-col gap-6">
      <div>
        <Typography.Paragraph type="secondary" className="!text-sm">
          People with access to this team.
        </Typography.Paragraph>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={members}
          pagination={false}
          locale={{ emptyText: "No members" }}
        />
      </div>

      <InviteSection invitations={invitations} />
    </div>
  );
}

// Create an invite by email (informational only) and manage existing ones. No
// email is sent — the admin shares the generated link, and the invitee may sign
// in with any address.
function InviteSection({ invitations }: { invitations: InvitationRow[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const { teamId } = useCurrentTeam();
  const [form] = Form.useForm();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const invite = () =>
    form.validateFields().then((v) =>
      start(async () => {
        const r = await inviteMember(teamId, v.email);
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        form.resetFields();
        setLinkUrl(r.url); // reveal it right away
        router.refresh();
      }),
    );

  const showLink = (id: string) => {
    setBusyId(id);
    start(async () => {
      const r = await getInvitationLink(teamId, id);
      setBusyId(null);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      setLinkUrl(r.url);
    });
  };

  const revoke = (id: string) => {
    setBusyId(id);
    start(async () => {
      const r = await revokeInvitation(teamId, id);
      setBusyId(null);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Invitation removed");
      router.refresh();
    });
  };

  return (
    <Card title="Invite a member">
      <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
        Generates a link — no email is sent. The invitee can sign in with any email. The email below is
        just a label for you.
      </Typography.Paragraph>
      <Form form={form} layout="inline" onFinish={invite} className="!mb-2">
        <Form.Item
          name="email"
          rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
          className="!flex-1"
        >
          <Input placeholder="person@example.com" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={pending}>
            Create invite link
          </Button>
        </Form.Item>
      </Form>

      {invitations.length > 0 && (
        <Table<InvitationRow>
          rowKey="id"
          className="!mt-4"
          size="small"
          pagination={false}
          dataSource={invitations}
          columns={[
            {
              title: "Email",
              dataIndex: "email",
              render: (email: string, r) => (
                <div className="leading-tight">
                  <div className="text-gray-900">{email}</div>
                  <div className="text-xs text-gray-400">
                    {r.acceptedAt ? `Accepted ${timeAgo(r.acceptedAt)}` : `Invited ${timeAgo(r.createdAt)}`}
                  </div>
                </div>
              ),
            },
            {
              title: "Status",
              width: 110,
              render: (_, r) =>
                r.acceptedAt ? <Tag color="green">Accepted</Tag> : <Tag color="gold">Pending</Tag>,
            },
            {
              title: "",
              width: 200,
              align: "right",
              render: (_, r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    loading={busyId === r.id}
                    onClick={() => showLink(r.id)}
                  >
                    Show link
                  </Button>
                  <Popconfirm
                    title="Remove this invitation?"
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => revoke(r.id)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} loading={busyId === r.id} />
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      )}

      <InviteLinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />
    </Card>
  );
}

// Shows one invite link with a copy button. Fetched on demand, never rendered
// into the page until asked for.
function InviteLinkModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      message.success("Copied");
    } catch {
      message.error("Could not copy");
    }
  };
  return (
    <Modal title="Invite link" open={!!url} onCancel={onClose} footer={null} destroyOnHidden>
      <Typography.Paragraph type="secondary" className="!text-sm">
        Share this link with the invitee. They can sign in with any email.
      </Typography.Paragraph>
      <div className="flex gap-2">
        <Input readOnly value={url ?? ""} className="!flex-1" onFocus={(e) => e.target.select()} />
        <Button type="primary" icon={<LinkOutlined />} onClick={copy}>
          Copy
        </Button>
      </div>
    </Modal>
  );
}
