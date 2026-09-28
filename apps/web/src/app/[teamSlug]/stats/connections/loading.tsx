import { Spin } from "antd";

export default function ConnectionStatusesLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spin size="large" />
      <span className="text-sm text-gray-500">Testing connections…</span>
    </div>
  );
}
