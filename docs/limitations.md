# Proxying limitations

Grossmargin Connect proxies upstream MCP servers behind one endpoint (a [bundle](../README.md#bundled-mcps)).
The proxy is stateless: each upstream operation opens its own connection, runs one call, and closes it.
This page lists what does not pass through, so you know where a downstream server won't work fully.

## What passes through

- **Tools** — `tools/list`, `tools/call`. Namespaced per member (`<slug>__tool`).
- **Resources** — `resources/list`, `resources/read`. The owning connection is encoded in the URI
  (`gmc://<slug>/…`) so a read routes back to the right account.
- **Prompts** — `prompts/list`, `prompts/get`. Namespaced like tools; a group's prompts take a `tenant`
  argument.

## Not supported

- **Sampling** (server asks the client to run an LLM), **elicitation**, and **roots**.
- **Completions** (argument autocomplete) and **logging** notifications.
- **Resource subscriptions** and **resource templates** (`resources/templates/list` returns empty).
- **Notifications** — `tools/list_changed`, `resources/list_changed`, `prompts/list_changed` and any
  server-initiated message are not forwarded. A client is not told when an upstream's lists change.

## No streaming

Every call is a single request and response. Progress notifications during a long call are not relayed —
the client waits for the final result. There is no server-initiated stream.

## No sessions

There is no session, upstream or downstream. Each upstream call reconnects, so a flow that depends on
session state across calls (a session-scoped cursor, an in-session auth step) will not work.

## Timeouts

- Remote (HTTP) calls: **10 s** hard limit.
- Local stdio calls: **30 s** per operation.

A tool slower than its limit fails. Long-running or agentic upstream tools do not work.

## Groups (tenanted)

- A group serves several accounts of one service under one namespace, selected by a `tenant` argument.
- **Tools and prompts** are taken from the **first tenant** — a group assumes every tenant exposes the
  same set. Sets are checked only at Test time, not per call.
- **Resources** are per-account data, so they are listed across **all** tenants (each read routes to its
  own account).

## Auth

- Upstream auth is **DCR** (OAuth authorization-code + PKCE + refresh), **static headers**, or **stdio
  env** only.
- DCR needs the server to advertise a Dynamic Client Registration endpoint.
- A DCR token refreshes automatically. When the refresh token itself expires, the connection needs a
  manual re-authorize in the UI.

## Local (stdio) servers

- Only allowlisted packages run, inside a short-lived worker thread (thread per operation).
- The package must be bundled into the build; arbitrary local servers are not run.
