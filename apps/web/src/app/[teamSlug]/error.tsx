"use client";

import { Button, Result } from "antd";
import { useEffect } from "react";

export default function TeamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Result
        status="error"
        title="Couldn't load this page"
        subTitle={error.message || "An unexpected error occurred."}
        extra={
          <Button type="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
