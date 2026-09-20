"use client";

import { Tabs } from "antd";
import { FolderOpenOutlined, KeyOutlined, SettingOutlined } from "@ant-design/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CredentialsTab, type Cred } from "./CredentialsTab";
import { PropertiesTab } from "./PropertiesTab";
import { DetailHeader } from "../../../DetailHeader";
import { Page } from "../../../Page";

const TABS = ["credentials", "properties"] as const;
type TabKey = (typeof TABS)[number];

export function VaultView({
  teamId,
  vaultId,
  name,
  description,
  credentials,
}: {
  teamId: string;
  vaultId: string;
  name: string;
  description: string | null;
  credentials: Cred[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const param = searchParams.get("tab");
  const active: TabKey = TABS.includes(param as TabKey) ? (param as TabKey) : "credentials";

  const setTab = (key: string) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", key);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <Page breadcrumb={[{ title: "Vaults", href: `/${teamId}` }, { title: name }]}>
      <DetailHeader
        icon={<FolderOpenOutlined />}
        title={name}
        subtitle={description || undefined}
        backHref={`/${teamId}`}
        backLabel="All vaults"
      />

      <Tabs
        activeKey={active}
        onChange={setTab}
        items={[
          {
            key: "credentials",
            label: (
              <span>
                <KeyOutlined /> Credentials
              </span>
            ),
            children: <CredentialsTab vaultId={vaultId} credentials={credentials} />,
          },
          {
            key: "properties",
            label: (
              <span>
                <SettingOutlined /> Properties
              </span>
            ),
            children: (
              <PropertiesTab teamId={teamId} vaultId={vaultId} name={name} description={description} />
            ),
          },
        ]}
      />
    </Page>
  );
}
