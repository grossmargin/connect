"use client";

import { Alert, Button, Card, Descriptions, Input, Typography } from "antd";
import { SafetyOutlined } from "@ant-design/icons";
import { useState, useTransition } from "react";
import { approveAuthorization, denyAuthorization, type AuthzParams } from "./consent-actions";

const CONFIRM_PHRASE = "I understand";

export function ConsentForm({ clientName, resource, params }: { clientName: string; resource: string; params: AuthzParams }) {
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matched = typed === CONFIRM_PHRASE;

  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <Card className="w-[460px]">
        <div className="mb-2 flex items-center gap-2">
          <SafetyOutlined style={{ fontSize: 24, color: "var(--ant-color-warning)" }} aria-hidden />
          <Typography.Title level={4} className="!m-0">
            Authorize access
          </Typography.Title>
        </div>

        <Typography.Paragraph>
          <Typography.Text strong>{clientName}</Typography.Text> is requesting an access token for your
          credentials.
        </Typography.Paragraph>

        <Descriptions size="small" column={1} bordered className="!mb-4">
          <Descriptions.Item label="Application">{clientName}</Descriptions.Item>
          <Descriptions.Item label="Resource">{resource}</Descriptions.Item>
          <Descriptions.Item label="Scope">credentials:read</Descriptions.Item>
        </Descriptions>

        <Alert
          type="error"
          showIcon
          message="This grants read access to secret values"
          description="With this token the application can list your vaults and reveal the plaintext of any credential in every team you belong to. Every reveal is recorded in the audit log. Only approve tools you trust."
          className="!mb-4"
        />

        <Typography.Paragraph className="!mb-2">
          Type <Typography.Text keyboard>{CONFIRM_PHRASE}</Typography.Text> to confirm you have read the above.
        </Typography.Paragraph>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          aria-label={`Type "${CONFIRM_PHRASE}" to confirm`}
          status={typed && !matched ? "warning" : undefined}
          className="!mb-4"
        />

        <div className="flex w-full justify-end gap-2">
          <Button danger disabled={pending} onClick={() => start(() => denyAuthorization(params))}>
            Deny
          </Button>
          <Button
            type="primary"
            disabled={!matched}
            loading={pending}
            onClick={() => start(() => approveAuthorization(params, typed))}
          >
            Approve access
          </Button>
        </div>
      </Card>
    </div>
  );
}
