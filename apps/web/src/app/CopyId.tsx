"use client";

import { Tooltip, Typography } from "antd";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";

// Monospace id with a copy button that appears on row hover. After a copy the
// button shows a check for 5s. Meant to sit inside a table row with `group`.
export function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 5000);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <Typography.Text code>{value}</Typography.Text>
      <Tooltip title={copied ? "Copied" : "Copy id"}>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy id"
          className={`cursor-pointer border-0 bg-transparent p-0.5 leading-none transition ${
            copied ? "text-green-600 opacity-100" : "text-gray-400 opacity-0 hover:text-indigo-600 group-hover:opacity-100"
          }`}
        >
          {copied ? <CheckOutlined /> : <CopyOutlined />}
        </button>
      </Tooltip>
    </span>
  );
}
