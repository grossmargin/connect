"use client";

import { App, Button, Card, Empty, Radio, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDefaultTeamAction } from "@/app/actions";

export type AccountTeam = { id: string; name: string; slug: string };

export function AccountView({
  name,
  email,
  teams,
  storedDefaultId,
  selectedTeamId,
}: {
  name: string | null;
  email: string | null;
  teams: AccountTeam[];
  storedDefaultId: string | null;
  selectedTeamId: string | null;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  // Pre-select the stored default, or the oldest team when none is set yet.
  const [value, setValue] = useState<string>(selectedTeamId ?? "");
  const [pending, start] = useTransition();

  // Dirty against what is actually stored, so saving the auto-picked oldest team
  // (no stored default yet) still works.
  const dirty = value !== (storedDefaultId ?? "");
  const backHref = teams[0] ? `/${teams[0].slug}` : "/";

  const save = () =>
    start(async () => {
      if (!value) return;
      const r = await setDefaultTeamAction(value);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      message.success("Saved");
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-[640px] p-6">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeftOutlined /> Back
      </Link>

      <Typography.Title level={3} className="!mb-4">
        Account settings
      </Typography.Title>

      <Card title="Profile" className="!mb-6">
        <div className="text-sm text-gray-900">{name || "—"}</div>
        <div className="text-sm text-gray-400">{email}</div>
      </Card>

      <Card title="Default team">
        <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
          The team your root MCP endpoint and post-login redirect resolve to. Without a default, the
          oldest team is used.
        </Typography.Paragraph>

        {teams.length === 0 ? (
          <Empty description="You are not in any team yet." />
        ) : (
          <>
            <Radio.Group
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex flex-col gap-2"
            >
              {teams.map((t) => (
                <Radio key={t.id} value={t.id}>
                  {t.name} <span className="text-gray-400">/{t.slug}</span>
                </Radio>
              ))}
            </Radio.Group>

            <div className="mt-4">
              <Button type="primary" loading={pending} disabled={!dirty} onClick={save}>
                Save
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
