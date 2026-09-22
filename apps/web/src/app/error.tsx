"use client";

import { Button, Result } from "antd";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Result
        status="error"
        title="Something went wrong"
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
