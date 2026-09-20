"use client";

import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import Link from "next/link";

// Header row for detail pages: square icon/avatar, title with a status tag and a
// muted subtitle, and a "back to list" button on the right.
export function DetailHeader({
  icon,
  title,
  subtitle,
  tag,
  backHref,
  backLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  tag?: React.ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-xl text-indigo-600">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-2xl font-semibold text-gray-900">{title}</h1>
            {tag}
          </div>
          {subtitle && <div className="mt-0.5 text-sm text-gray-500">{subtitle}</div>}
        </div>
      </div>
      <Link href={backHref}>
        <Button icon={<ArrowLeftOutlined />}>{backLabel}</Button>
      </Link>
    </div>
  );
}
