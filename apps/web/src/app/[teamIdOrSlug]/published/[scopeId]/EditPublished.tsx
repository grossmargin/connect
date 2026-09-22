"use client";

import { App, Button, Card, Form, Input, List, Modal, Popconfirm, Select, Tag, Typography } from "antd";
import { ApiOutlined, AppstoreOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  updateScope,
  deleteScope,
  addScopeConnections,
  removeScopeConnection,
  createGroup,
  updateGroup,
  deleteGroup,
} from "../actions";
import { CopyId } from "../../../CopyId";
import { Page } from "../../../Page";
import { DetailHeader } from "../../../DetailHeader";
import { useCurrentTeam } from "../../../TeamContext";

export type ConnOption = { id: string; name: string; slug: string };
export type GroupData = { id: string; name: string; slug: string; tenantIds: string[] };
type Scope = { id: string; name: string; slug: string; isDefault: boolean };

export function EditPublished({
  scope,
  memberConnectionIds,
  groups,
  allConnections,
}: {
  scope: Scope;
  memberConnectionIds: string[];
  groups: GroupData[];
  allConnections: ConnOption[];
}) {
  const router = useRouter();
  const { teamId, teamSlug } = useCurrentTeam();
  const { message } = App.useApp();
  const [propsForm] = Form.useForm();
  const [saving, startSave] = useTransition();
  const [busy, startBusy] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [groupModal, setGroupModal] = useState<{ group: GroupData | null } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const endpoint = scope.isDefault ? `/${teamSlug}` : `/${teamSlug}/${scope.slug}`;
  const connSlug = (id: string) => allConnections.find((c) => c.id === id)?.slug ?? id;
  const connName = (id: string) => allConnections.find((c) => c.id === id)?.name ?? id;
  const members = memberConnectionIds;
  const addable = allConnections.filter((c) => !members.includes(c.id));

  const saveProps = () =>
    propsForm.validateFields().then((v) =>
      startSave(async () => {
        const r = await updateScope(teamId, scope.id, v.name, v.slug ?? "");
        if ("error" in r) {
          message.error(r.error);
          return;
        }
        message.success("Saved");
        router.refresh();
      }),
    );

  const removeMember = (id: string) =>
    startBusy(async () => {
      const r = await removeScopeConnection(teamId, scope.id, id);
      if ("error" in r) {
          message.error(r.error);
          return;
        }
      message.success("Removed");
      router.refresh();
    });

  const removeScope = () =>
    startDelete(async () => {
      const r = await deleteScope(teamId, scope.id);
      if ("error" in r) {
          message.error(r.error);
          return;
        }
      message.success("Deleted");
      router.replace(`/${teamSlug}/published`);
    });

  const removeGroup = (g: GroupData) =>
    startBusy(async () => {
      const r = await deleteGroup(teamId, g.id);
      if ("error" in r) {
          message.error(r.error);
          return;
        }
      message.success("Group deleted");
      router.refresh();
    });

  return (
    <Page
      breadcrumb={[
        { title: "Published MCPs", href: `/${teamSlug}/published` },
        { title: scope.name },
      ]}
    >
      <DetailHeader
        icon={<AppstoreOutlined />}
        title={scope.name}
        subtitle={`Published MCP · ${endpoint}`}
        tag={scope.isDefault ? <Tag color="geekblue">Default</Tag> : undefined}
        backHref={`/${teamSlug}/published`}
        backLabel="All published MCPs"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {!scope.isDefault && (
            <Card title="Properties">
              <Form
                form={propsForm}
                layout="vertical"
                requiredMark={false}
                initialValues={{ name: scope.name, slug: scope.slug }}
              >
                <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="slug"
                  label="Id (path segment)"
                  extra="Letters, digits and underscore only."
                >
                  <Input />
                </Form.Item>
                <div className="flex gap-2">
                  <Button type="primary" loading={saving} onClick={saveProps}>
                    Save changes
                  </Button>
                  <Button onClick={() => propsForm.resetFields()}>Cancel</Button>
                </div>
              </Form>
            </Card>
          )}

          <Card
            title="Individual MCPs"
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={() => setAddOpen(true)}
                disabled={addable.length === 0}
              >
                Add MCP
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
              Published directly. Each one's tools are prefixed with its own id (no{" "}
              <Typography.Text code>tenant</Typography.Text> argument).
            </Typography.Paragraph>
            {members.length === 0 ? (
              <Typography.Text type="secondary" className="!text-sm">
                No individual MCPs yet.
              </Typography.Text>
            ) : (
              <List
                size="small"
                bordered
                dataSource={members}
                renderItem={(id) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        key="del"
                        title="Remove this MCP from the endpoint?"
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => removeMember(id)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} loading={busy} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<ApiOutlined aria-hidden />}
                      title={
                        <span>
                          <Typography.Text code>{connSlug(id)}__</Typography.Text> {connName(id)}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card
            title="Groups"
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={() => setGroupModal({ group: null })}
                disabled={allConnections.length === 0}
              >
                New group
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" className="!mt-0 !text-sm">
              A group bundles several accounts of one service as <b>tenants</b>. Its tools share the
              group id as a prefix and take a required <Typography.Text code>tenant</Typography.Text>{" "}
              argument.
            </Typography.Paragraph>
            {groups.length === 0 ? (
              <Typography.Text type="secondary" className="!text-sm">
                No groups yet.
              </Typography.Text>
            ) : (
              <List
                size="small"
                bordered
                dataSource={groups}
                renderItem={(g) => (
                  <List.Item
                    actions={[
                      <Button
                        key="edit"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => setGroupModal({ group: g })}
                      />,
                      <Popconfirm
                        key="del"
                        title="Delete this group?"
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => removeGroup(g)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<AppstoreOutlined aria-hidden />}
                      title={
                        <span>
                          <Typography.Text code>{g.slug}__</Typography.Text> {g.name}
                        </span>
                      }
                      description={`${g.tenantIds.length} tenant(s): ${
                        g.tenantIds.map(connSlug).join(", ") || "none"
                      }`}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Endpoint">
            <CopyId value={endpoint} />
            <Typography.Paragraph type="secondary" className="!mb-0 !mt-3 !text-sm">
              Connect an MCP client to this URL. It exposes {members.length} individual MCP(s) and{" "}
              {groups.length} group(s).
            </Typography.Paragraph>
          </Card>

          {!scope.isDefault && (
            <Card className="!border-red-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-red-600">Delete published MCP</div>
                  <div className="text-xs text-gray-500">Stops serving this endpoint.</div>
                </div>
                <Popconfirm
                  title="Delete this published MCP?"
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={removeScope}
                >
                  <Button danger loading={deleting}>
                    Delete
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          )}
        </div>
      </div>

      {addOpen && (
        <AddMcpModal
          scopeId={scope.id}
          addable={addable}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}

      {groupModal && (
        <GroupModal
          scopeId={scope.id}
          group={groupModal.group}
          allConnections={allConnections}
          onClose={() => setGroupModal(null)}
          onSaved={() => {
            setGroupModal(null);
            router.refresh();
          }}
        />
      )}
    </Page>
  );

  function AddMcpModal({
    scopeId,
    addable,
    onClose,
    onSaved,
  }: {
    scopeId: string;
    addable: ConnOption[];
    onClose: () => void;
    onSaved: () => void;
  }) {
    const [form] = Form.useForm();
    const [pending, start] = useTransition();

    const submit = () =>
      form.validateFields().then((v) =>
        start(async () => {
          const r = await addScopeConnections(teamId, scopeId, v.connectionIds ?? []);
          if ("error" in r) {
          message.error(r.error);
          return;
        }
          message.success("Added");
          onSaved();
        }),
      );

    return (
      <Modal title="Add MCPs" open onCancel={onClose} okText="Add" onOk={submit} confirmLoading={pending} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
          <Form.Item
            name="connectionIds"
            label="MCP connections"
            rules={[{ required: true, message: "Pick at least one" }]}
          >
            <Select
              mode="multiple"
              placeholder="Pick MCP connections"
              options={addable.map((c) => ({ value: c.id, label: `${c.name} — ${c.slug}` }))}
              optionFilterProp="label"
              suffixIcon={<ApiOutlined />}
              autoFocus
            />
          </Form.Item>
        </Form>
      </Modal>
    );
  }

  function GroupModal({
    scopeId,
    group,
    allConnections,
    onClose,
    onSaved,
  }: {
    scopeId: string;
    group: GroupData | null;
    allConnections: ConnOption[];
    onClose: () => void;
    onSaved: () => void;
  }) {
    const [form] = Form.useForm();
    const [pending, start] = useTransition();

    const submit = () =>
      form.validateFields().then((v) =>
        start(async () => {
          const r = group
            ? await updateGroup(teamId, group.id, v.name, v.slug ?? "", v.tenantIds ?? [])
            : await createGroup(teamId, scopeId, v.name, v.slug ?? "", v.tenantIds ?? []);
          if ("error" in r) {
          message.error(r.error);
          return;
        }
          message.success(group ? "Group saved" : "Group created");
          onSaved();
        }),
      );

    return (
      <Modal
        title={group ? `Edit group — ${group.name}` : "New group"}
        open
        onCancel={onClose}
        okText={group ? "Save" : "Create"}
        onOk={submit}
        confirmLoading={pending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          preserve={false}
          initialValues={{ name: group?.name, slug: group?.slug, tenantIds: group?.tenantIds ?? [] }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
            <Input placeholder="e.g. Ramp" autoFocus />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Id (tool prefix)"
            extra="Tools become <id>__tool. Letters, digits and underscore only; defaults from the name."
          >
            <Input placeholder="e.g. ramp" />
          </Form.Item>
          <Form.Item
            name="tenantIds"
            label="Tenants"
            extra="The accounts this group federates. Each is picked at call time via the `tenant` argument."
          >
            <Select
              mode="multiple"
              placeholder="Pick MCP connections"
              options={allConnections.map((c) => ({ value: c.id, label: `${c.name} — ${c.slug}` }))}
              optionFilterProp="label"
              suffixIcon={<ApiOutlined />}
            />
          </Form.Item>
        </Form>
      </Modal>
    );
  }
}
