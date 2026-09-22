import { Spin } from "antd";

export default function TeamLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spin size="large" />
    </div>
  );
}
