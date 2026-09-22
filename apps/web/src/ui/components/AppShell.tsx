"use client";

import { Avatar, Button, Dropdown, Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import {
  ApiOutlined,
  BarChartOutlined,
  DownOutlined,
  FolderOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { doSignOut } from "@/app/actions";
import { TeamProvider } from "@/ui/components/TeamContext";

const { Sider, Content } = Layout;

function initials(text: string): string {
  const parts = text.trim().split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function navLabel(text: string, count?: number) {
  return (
    <span className="flex items-center justify-between">
      <span>{text}</span>
      {count != null && <span className="text-xs text-gray-400">{count}</span>}
    </span>
  );
}

export function AppShell({
  teamId,
  teamSlug,
  teamName,
  userName,
  email,
  counts,
  isAdmin = false,
  children,
}: {
  teamId: string;
  teamSlug: string;
  teamName: string;
  userName?: string | null;
  email?: string | null;
  counts: { connections: number; scopes: number };
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/${teamSlug}`;
  const [, start] = useTransition();

  const vaultsActive = pathname === base || pathname.startsWith(`${base}/vaults`);

  const items: MenuProps["items"] = [
    { key: base, icon: <FolderOutlined />, label: <Link href={base}>{navLabel("Vaults")}</Link> },
    {
      key: `${base}/mcp-connections`,
      icon: <ApiOutlined />,
      label: <Link href={`${base}/mcp-connections`}>{navLabel("MCP Connections", counts.connections)}</Link>,
    },
    {
      key: `${base}/published`,
      icon: <ShareAltOutlined />,
      label: <Link href={`${base}/published`}>{navLabel("Bundled MCPs", counts.scopes)}</Link>,
    },
    {
      key: `${base}/settings`,
      icon: <SettingOutlined />,
      label: <Link href={`${base}/settings`}>{navLabel("Team Settings")}</Link>,
    },
    ...(isAdmin
      ? [
          {
            key: `${base}/stats`,
            icon: <BarChartOutlined />,
            label: <Link href={`${base}/stats`}>{navLabel("Team Stats")}</Link>,
          },
        ]
      : []),
  ];

  const displayName = userName || email || "Account";

  return (
    <TeamProvider team={{ teamId, teamSlug, teamName }}>
      <Layout style={{ minHeight: "100dvh" }}>
        <Sider theme="light" width={260} className="!border-r !border-gray-200">
          <div className="flex h-full flex-col">
            <Link href={base} className="flex items-center gap-3 px-5 py-5 text-inherit">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <SafetyCertificateOutlined />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-semibold text-gray-900">Grossmargin</span>
                <span className="text-[11px] font-medium uppercase tracking-widest text-gray-400">Connect</span>
              </span>
            </Link>

            <div className="px-6 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Workspace
            </div>
            <Menu
              mode="inline"
              theme="light"
              selectedKeys={[vaultsActive ? base : pathname]}
              items={items}
              className="flex-1 !border-r-0"
            />

            <div className="border-t border-gray-200 p-3">
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "signout",
                      icon: <LogoutOutlined />,
                      label: "Sign out",
                      onClick: () => start(() => doSignOut()),
                    },
                  ],
                }}
              >
                <Button
                  type="text"
                  block
                  className="!flex !h-auto w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left"
                >
                  <Avatar className="!bg-gray-900 !text-white" size={36}>
                    {initials(displayName)}
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-gray-900">{userName || "Account"}</span>
                    {email && <span className="truncate text-xs text-gray-400">{email}</span>}
                  </span>
                  <DownOutlined className="text-gray-400" />
                </Button>
              </Dropdown>

              <div className="mt-2 px-2 text-[11px] text-gray-400">
                <a
                  href="https://grossmargin.io/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 hover:text-gray-600"
                >
                  Privacy
                </a>
                {" · "}
                <a
                  href="https://grossmargin.io/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 hover:text-gray-600"
                >
                  Terms
                </a>
              </div>
            </div>
          </div>
        </Sider>

        <Layout>
          <Content>{children}</Content>
        </Layout>
      </Layout>
    </TeamProvider>
  );
}
