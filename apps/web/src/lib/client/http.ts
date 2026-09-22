import axios from "axios";

// Shared browser-side HTTP client for TanStack Query fetchers. Same-origin API
// calls; axios throws on non-2xx so query error states work out of the box.
export const http = axios.create();
