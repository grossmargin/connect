"use client";

import { Button, Card, Typography } from "antd";
import { GoogleOutlined, LockOutlined } from "@ant-design/icons";
import { useTransition } from "react";
import { googleSignIn } from "../actions";

export function LoginCard({ callbackUrl }: { callbackUrl?: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <Card className="w-90 text-center">
        <LockOutlined style={{ fontSize: 32, color: "var(--ant-color-primary)" }} aria-hidden />
        <Typography.Title level={3} className="!mt-3 !mb-1">
          Grossmargin Connect
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Sign in with your grossmargin.io account.
        </Typography.Paragraph>
        <Button
          type="primary"
          size="large"
          block
          icon={<GoogleOutlined />}
          loading={pending}
          onClick={() => start(() => googleSignIn(callbackUrl))}
        >
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
