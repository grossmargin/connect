import "server-only";
import axios from "axios";

// Shared server-side HTTP client for our own outbound calls (Nango, DCR).
// Does not throw on non-2xx — callers inspect `status` themselves. The MCP SDK
// keeps its own fetch-based transport; this is only for our direct requests.
export const http = axios.create({
  timeout: 10_000,
  validateStatus: () => true,
});
