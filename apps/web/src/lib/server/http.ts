import "server-only";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { errorInfo, logEvent, redact, redactUrl } from "@/lib/server/httpLog";

// Shared server-side HTTP client for our own outbound calls (Nango, DCR).
// Does not throw on non-2xx — callers inspect `status` themselves. The MCP SDK
// keeps its own fetch-based transport; this is only for our direct requests.
export const http = axios.create({
  timeout: 10_000,
  validateStatus: () => true,
});

// Logs every request and response in full (secrets masked).
type Timed = InternalAxiosRequestConfig & { startedAt?: number };
const fullUrl = (c: InternalAxiosRequestConfig) => redactUrl(axios.getUri(c));

http.interceptors.request.use((c: Timed) => {
  c.startedAt = Date.now();
  logEvent("http", {
    event: "request",
    method: c.method?.toUpperCase(),
    url: fullUrl(c),
    headers: redact(c.headers?.toJSON?.() ?? c.headers),
    body: redact(c.data),
  });
  return c;
});

http.interceptors.response.use(
  (res) => {
    const c = res.config as Timed;
    logEvent("http", {
      event: "response",
      method: c.method?.toUpperCase(),
      url: fullUrl(c),
      status: res.status,
      durationMs: c.startedAt ? Date.now() - c.startedAt : undefined,
      headers: redact(res.headers),
      body: redact(res.data),
    });
    return res;
  },
  (e) => {
    const c = (e?.config ?? {}) as Timed;
    logEvent("http", {
      event: "error",
      method: c.method?.toUpperCase(),
      url: e?.config ? fullUrl(c) : undefined,
      durationMs: c.startedAt ? Date.now() - c.startedAt : undefined,
      error: errorInfo(e),
    });
    return Promise.reject(e);
  },
);
