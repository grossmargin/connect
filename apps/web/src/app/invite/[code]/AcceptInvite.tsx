"use client";

import { App, Button, Card, Result, Typography } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acceptInvitation } from "@/app/actions";

type Props =
  | { status: "ok"; teamName: string; code: string }
  | { status: "used"; teamName: string }
  | { status: "invalid" };

export function AcceptInvite(props: Props) {
  const router = useRouter();
  const { message } = App.useApp();
  const [pending, start] = useTransition();

  if (props.status !== "ok") {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-4">
        <Card className="w-96">
          <Result
            status="warning"
            title={props.status === "used" ? "Invitation already used" : "Invalid invitation"}
            subTitle={
              props.status === "used"
                ? `This link for ${props.teamName} has already been used. Ask an admin for a new one.`
                : "This invitation link is invalid or was removed."
            }
            extra={
              <Button type="primary" onClick={() => router.push("/")}>
                Go home
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const accept = () =>
    start(async () => {
      const r = await acceptInvitation(props.code);
      if ("error" in r) {
        message.error(r.error);
        return;
      }
      router.push(`/${r.slug}`);
      router.refresh();
    });

  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <Card className="w-96 text-center">
        <TeamOutlined style={{ fontSize: 32, color: "var(--ant-color-primary)" }} aria-hidden />
        <Typography.Title level={4} className="!mt-3 !mb-1">
          Join {props.teamName}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          You have been invited to join this team.
        </Typography.Paragraph>
        <Button type="primary" size="large" block loading={pending} onClick={accept}>
          Join team
        </Button>
      </Card>
    </div>
  );
}
