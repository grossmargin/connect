"use client";

import { App, Button, Modal, Popconfirm, Spin, Tag, Typography } from "antd";
import { EyeOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  const [revealed, setRevealed] = useState(false);

  // Masked summary loads while the modal is open (and not yet revealed). Reveal
  // is a separate, audit-logged read shown in place of the masked one.
  const query = useQuery({
    queryKey: ["connection-credentials", teamId, connectionId],
    enabled: open && !revealed,
    queryFn: async () => {
      const r = await getConnectionCredentials(teamId, connectionId, false);
      if ("error" in r) throw new Error(r.error);
      return r.summary as Summary;
    },
  });

  const revealMutation = useMutation({
    mutationFn: async () => {
      const r = await getConnectionCredentials(teamId, connectionId, true);
      if ("error" in r) throw new Error(r.error);
      return r.summary as Summary;
    },
    onSuccess: () => setRevealed(true),
    onError: (e) => message.error(e instanceof Error ? e.message : "Failed"),
  });

  const summary = revealed ? revealMutation.data ?? null : query.data ?? null;
  const loading = query.isFetching || revealMutation.isPending;
  const reveal = () => revealMutation.mutate();
  const close = () => {
    setRevealed(false);
    revealMutation.reset();
    onClose();
  };

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          Technical details — {connectionName}
          {revealed && <Tag color="red">Secrets revealed</Tag>}
        </span>
      }
      open={open}
      onCancel={close}
      width={640}
      footer={[
        <Button key="close" onClick={close}>
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
          {query.isError
            ? `Error: ${query.error instanceof Error ? query.error.message : "failed to load"}`
            : summary
              ? JSON.stringify(summary, null, 2)
              : "…"}
        </pre>
      </Spin>
    </Modal>
  );
}
