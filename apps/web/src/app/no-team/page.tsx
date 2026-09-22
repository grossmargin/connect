import { Card, Empty } from "antd";
import { requireUser } from "@/lib/server/session";

export default async function NoTeamPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-[800px] p-6">
      <Card className="mt-12">
        <Empty description="You are not in a team yet. Ask an admin to add you." />
      </Card>
    </main>
  );
}
