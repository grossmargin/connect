"use client";

import { Breadcrumb } from "antd";
import Link from "next/link";

export type Crumb = { title: string; href?: string };

// Shared page chrome: sticky top bar (breadcrumb) plus the centered content
// container. Every page renders its body inside this.
export function Page({ breadcrumb, children }: { breadcrumb: Crumb[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-200 bg-white px-6">
        <Breadcrumb
          items={breadcrumb.map((c) => ({
            title: c.href ? <Link href={c.href}>{c.title}</Link> : c.title,
          }))}
        />
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-8 py-8">{children}</main>
    </div>
  );
}

// Big title + description + optional action, above a list.
export function PageIntro({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-1 max-w-xl text-sm text-gray-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
