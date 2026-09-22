"use client";

import { Button, Tooltip, Typography } from "antd";
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
        <Button
          type="text"
          size="small"
          onClick={copy}
          aria-label="Copy id"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          className={`!p-0.5 transition ${
            copied ? "!text-green-600 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        />
      </Tooltip>
    </span>
  );
}
