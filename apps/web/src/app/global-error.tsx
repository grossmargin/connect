"use client";

// Catches errors in the root layout itself (where the normal error boundary
// can't run). Must render its own <html>/<body> and cannot rely on providers.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>{error.message || "An unexpected error occurred."}</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
