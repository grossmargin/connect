"use client";

import { Card, Typography } from "antd";
import { CreateTeamForm } from "@/ui/components/CreateTeam";

// Client component: antd's Typography.Title / .Paragraph are undefined when
// accessed from a server component.
export function NoTeamCard() {
  return (
    <Card className="w-96">
      <Typography.Title level={4} className="!mb-1">
        Create your team
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="!mb-4">
        You are not in a team yet. Create one to get started, or ask an admin for an invite link.
      </Typography.Paragraph>
      <CreateTeamForm />
    </Card>
  );
}
