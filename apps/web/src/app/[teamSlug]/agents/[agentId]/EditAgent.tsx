"use client";

import { App, Button, Card, Empty, Form, Input, Popconfirm, Select, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, RobotOutlined, ShareAltOutlined, UserOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAgent, updateAgent } from "../actions";
import { DetailHeader } from "@/ui/components/DetailHeader";
import { Page } from "@/ui/components/Page";
import { useCurrentTeam } from "@/ui/components/TeamContext";
import { parseWatchText } from "@/lib/isomorphic/agentContext";

export type BotOption = {
  id: string;
  name: string;
  username: string | null;
  platform: string;
};
type Link = { botId: string; context: Record<string, unknown> };
type Agent = { id: string; name: string; systemPromptUrl: string; scopeIds: string[]; bots: Link[] };

// Editable text of a Telegram context: one watch entry per line.
function watchText(context: Record<string, unknown>): string {
  const w = context.watch;
  return Array.isArray(w) ? w.filter((x) => typeof x === "string").join("\n") : "";
}

export function EditAgent({
  agent,
  allBots,
  allScopes,
}: {
  agent: Agent;
  allBots: BotOption[];
  allScopes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [name, setName] = useState(agent.name);
  const [promptUrl, setPromptUrl] = useState(agent.systemPromptUrl);
  const [scopeIds, setScopeIds] = useState(agent.scopeIds);
  const [links, setLinks] = useState<Link[]>(agent.bots);
  // Raw textarea text per bot; parsed on save so typing isn't reformatted.
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(agent.bots.map((l) => [l.botId, watchText(l.context)])),
  );
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const botById = new Map(allBots.map((b) => [b.id, b]));
  const addable = allBots.filter((b) => !links.some((l) => l.botId === b.id));

  const save = () =>
    startSave(async () => {
      const bots = links.map((l) => ({ botId: l.botId, context: { watch: parseWatchText(texts[l.botId] ?? "") } }));
      const r = await updateAgent(teamId, agent.id, { name, systemPromptUrl: promptUrl, scopeIds, bots });
      if (r?.error) {
        message.error(r.error);
        return;
      }
      message.success("Saved");
      router.refresh();
    });

  const remove = () =>
    startDelete(async () => {
      await deleteAgent(teamId, agent.id);
      router.push(`/${teamSlug}/agents`);
    });

  return (
    <Page breadcrumb={[{ title: "Agents", href: `/${teamSlug}/agents` }, { title: agent.name }]}>
      <DetailHeader icon={<UserOutlined />} title={agent.name} backHref={`/${teamSlug}/agents`} backLabel="All agents" />

      <div className="flex flex-col gap-6">
        <Card title="Agent">
          <Form layout="vertical" requiredMark={false}>
            <Form.Item label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Form.Item>
            <Form.Item label="System prompt" extra="Link to the page with the prompt, e.g. in Notion." className="!mb-0">
              <Input
                value={promptUrl}
                onChange={(e) => setPromptUrl(e.target.value)}
                placeholder="https://www.notion.so/..."
              />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="Bots"
          extra={
            addable.length > 0 && (
              <Select
                value={null}
                placeholder={
                  <span>
                    <PlusOutlined /> Add bot
                  </span>
                }
                style={{ width: 200 }}
                options={addable.map((b) => ({ value: b.id, label: b.name }))}
                onChange={(botId: string) => setLinks((ls) => [...ls, { botId, context: {} }])}
              />
            )
          }
        >
          <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
            The bots the agent works through, and what it watches in each.
          </Typography.Paragraph>
          {links.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={allBots.length ? "No bots added" : "This team has no bots yet"} />
          ) : (
            <div className="flex flex-col gap-4">
              {links.map((l) => {
                const bot = botById.get(l.botId);
                if (!bot) return null;
                return (
                  <div key={l.botId} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        <RobotOutlined className="mr-2 text-indigo-600" />
                        {bot.name}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {bot.platform}
                          {bot.username && ` · @${bot.username}`}
                        </span>
                      </span>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setLinks((ls) => ls.filter((x) => x.botId !== l.botId))}
                      />
                    </div>
                    {bot.platform === "telegram" && (
                      <>
                        <Input.TextArea
                          rows={4}
                          value={texts[l.botId] ?? ""}
                          onChange={(e) => setTexts((t) => ({ ...t, [l.botId]: e.target.value }))}
                          placeholder={"@finance_chat\n@ann_lee\n-1001234567890"}
                          className="font-mono !text-sm"
                        />
                        <Typography.Text type="secondary" className="mt-1 block text-xs">
                          What to watch: one @username, @groupname or chat id per line. Empty means all chats.
                        </Typography.Text>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Bundled MCPs">
          <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
            The bundles whose tools the agent may use.
          </Typography.Paragraph>
          <Select
            mode="multiple"
            value={scopeIds}
            onChange={setScopeIds}
            className="w-full"
            placeholder="Pick bundled MCPs"
            options={allScopes.map((s) => ({ value: s.id, label: s.name }))}
            optionFilterProp="label"
            suffixIcon={<ShareAltOutlined />}
          />
        </Card>

        <div className="flex justify-between">
          <Button type="primary" loading={saving} onClick={save}>
            Save changes
          </Button>
          <Popconfirm title="Delete this agent?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger loading={deleting}>
              Delete agent
            </Button>
          </Popconfirm>
        </div>
      </div>
    </Page>
  );
}
