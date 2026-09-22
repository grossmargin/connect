"use client";

import { App, Button, Modal, Popconfirm, Spin, Tag, Typography } from "antd";
import { EyeOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useEffect, useState, useTransition } from "react";
import { getConnectionCredentials } from "./actions";
import { useCurrentTeam } from "@/ui/components/TeamContext";

type Summary = Record<string, unknown>;

// Technical summary of what we store for a connection (tokens, client, claims).
// Secrets are masked until the user reveals them, which is audit-logged.
export function ConnectionTechModal({
  connectionId,
  connectionName,
  open,
  onClose,
}: {
  connectionId: string;
  connectionName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { teamId } = useCurrentTeam();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setSummary(null);
    setRevealed(false);
    start(async () => {
      const r = await getConnectionCredentials(teamId, connectionId, false);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      setSummary(r.summary);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId, teamId]);

  const reveal = () =>
    start(async () => {
      const r = await getConnectionCredentials(teamId, connectionId, true);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      setSummary(r.summary);
      setRevealed(true);
    });

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          Technical details — {connectionName}
          {revealed && <Tag color="red">Secrets revealed</Tag>}
        </span>
      }
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        revealed ? null : (
          <Popconfirm
            key="reveal"
            title="Reveal full secrets?"
            description="The full values are shown and this access is written to the audit log."
            okText="Reveal"
            okButtonProps={{ danger: true }}
            onConfirm={reveal}
          >
            <Button danger icon={<EyeOutlined />} loading={loading}>
              Reveal full secrets
            </Button>
          </Popconfirm>
        ),
      ]}
    >
      <Typography.Paragraph type="secondary" className="!text-sm">
        <SafetyCertificateOutlined /> Everything stored for this connection. Secret values are masked
        (first/last characters); <Typography.Text strong>null</Typography.Text> means nothing is stored.
      </Typography.Paragraph>
      <Spin spinning={loading && !summary}>
        <pre className="max-h-[52vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed">
          {summary ? JSON.stringify(summary, null, 2) : "…"}
        </pre>
      </Spin>
    </Modal>
  );
}
