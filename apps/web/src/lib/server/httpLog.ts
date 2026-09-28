import "server-only";

// Logs outbound HTTP requests and responses in full: method, URL, headers,
// body, status, duration. Secret values are masked (first 6 and last 4 chars
// kept). One JSON line per event, so Vercel log search works on any field.

const MAX_BODY = 32_000;
const SECRET_KEY = /(access|refresh|id)_token|secret|verifier|password|authorization|cookie|api[-_]?key/i;

function mask(v: string): string {
  if (v.length <= 12) return `${v.slice(0, 2)}…(${v.length})`;
  return `${v.slice(0, 6)}…${v.slice(-4)} (${v.length})`;
}

export function redact(v: unknown, key = ""): unknown {
  if (typeof v === "string") return SECRET_KEY.test(key) ? mask(v) : v;
  if (Array.isArray(v)) return v.map((x) => redact(x, key));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
  }
  return v;
}

function cap(s: string): string {
  return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}…[${s.length - MAX_BODY} more chars]` : s;
}

// Parses a JSON or form body so secret fields can be masked. Falls back to text.
function parseBody(text: string, contentType: string | null): unknown {
  if (!text) return undefined;
  try {
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      return redact(Object.fromEntries(new URLSearchParams(text)));
    }
    return redact(JSON.parse(text));
  } catch {
    return cap(text);
  }
}

function headerObj(h: HeadersInit | Headers | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!h) return {};
  const entries = h instanceof Headers ? [...h.entries()] : Array.isArray(h) ? h : Object.entries(h);
  return redact(Object.fromEntries(entries)) as Record<string, unknown>;
}

// Masks secret query params in a URL (e.g. ?access_token=…).
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams) if (SECRET_KEY.test(k)) u.searchParams.set(k, mask(v));
    return u.toString();
  } catch {
    return url;
  }
}

export function logEvent(tag: string, data: Record<string, unknown>): void {
  console.log(`[${tag}] ${JSON.stringify(data)}`);
}

function bodyText(body: BodyInit | null | undefined): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return `[${body.constructor?.name ?? typeof body} body]`;
}

// Wraps fetch so every request and response is logged. Streaming (SSE)
// response bodies are not read.
export function loggingFetch(tag: string, inner: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : null;
    const method = init?.method ?? req?.method ?? "GET";
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const reqHeaders = new Headers(req?.headers);
    new Headers(init?.headers).forEach((v, k) => reqHeaders.set(k, v));
    const startedAt = Date.now();
    logEvent(tag, {
      event: "request",
      method,
      url: redactUrl(url),
      headers: headerObj(reqHeaders),
      body: parseBody(bodyText(init?.body), reqHeaders.get("content-type")),
    });

    let res: Response;
    try {
      res = await inner(input, init);
    } catch (e) {
      logEvent(tag, { event: "error", method, url: redactUrl(url), durationMs: Date.now() - startedAt, error: errorInfo(e) });
      throw e;
    }

    const contentType = res.headers.get("content-type");
    let body: unknown;
    if (contentType?.includes("text/event-stream")) body = "[event stream, not read]";
    else {
      try {
        body = parseBody(await res.clone().text(), contentType);
      } catch (e) {
        body = `[unreadable: ${(e as Error).message}]`;
      }
    }
    logEvent(tag, {
      event: "response",
      method,
      url: redactUrl(url),
      status: res.status,
      durationMs: Date.now() - startedAt,
      headers: headerObj(res.headers),
      body,
    });
    return res;
  };
}

// Error with its cause chain, for fetch failures like "fetch failed" whose
// real reason (DNS, TLS, reset) sits in `cause`.
export function errorInfo(e: unknown): unknown {
  if (!(e instanceof Error)) return String(e);
  return { name: e.name, message: e.message, cause: e.cause ? errorInfo(e.cause) : undefined };
}
