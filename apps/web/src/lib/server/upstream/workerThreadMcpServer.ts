import "server-only";
import { Worker } from "node:worker_threads";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { isAllowedLocalMcpPackage } from "@/lib/isomorphic/localMcpPackages";
import { StreamTransport } from "./streamTransport";
import type { UpstreamMcpServer, ToolListing } from "./types";

// How long a single operation (open worker -> connect -> one call -> teardown)
// may take before we give up and kill the worker.
const OP_TIMEOUT_MS = 30_000;

// Worker entry, passed as an eval string so there is no separate file for the
// bundler to trace. It runs in a plain Node context (no webpack): it resolves
// the target package from node_modules and dynamically imports it. The package
// is a normal stdio MCP server — its top-level code binds a StdioServerTransport
// to THIS worker's process.stdin/stdout, which we've wired (stdin/stdout: true)
// to the parent's worker.stdin/worker.stdout. So importing it *is* starting the
// server on our private pipe, fully isolated from the function's real stdio.
const WORKER_CODE = `
const { workerData } = require("node:worker_threads");
(async () => {
  try {
    const entry = require.resolve(workerData.pkg);
    await import(require("node:url").pathToFileURL(entry).href);
  } catch (err) {
    console.error("mcp worker failed to start:", (err && err.stack) || err);
    process.exit(1);
  }
})();
`;

// Environment inherited by the worker in addition to the connection's own env.
// The stdio server needs PATH (some resolve helper binaries); everything else is
// withheld so a local server can't read our secrets out of process.env.
function baseEnv(): Record<string, string> {
  return process.env.PATH ? { PATH: process.env.PATH } : {};
}

// A local MCP server: a vetted Node stdio package we run inside a short-lived
// worker thread. There is no persistent worker — every operation spins one up,
// runs the single call, and terminates it (thread-per-operation). The package
// must be on the allowlist (checked here as a defense-in-depth backstop; the
// create action checks too) and a build-time dependency shipped to the runtime.
export class WorkerThreadMcpServer implements UpstreamMcpServer {
  constructor(
    readonly label: string,
    private readonly pkg: string,
    private readonly env: Record<string, string>,
  ) {
    if (!isAllowedLocalMcpPackage(pkg)) {
      throw new Error(`Local MCP package "${pkg}" is not on the allowlist.`);
    }
  }

  listTools(): Promise<ToolListing> {
    return this.withClient(async (client) => {
      const instructions = client.getInstructions();
      const res = await client.listTools();
      return { tools: res.tools, instructions: instructions || undefined };
    });
  }

  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.withClient((client) => client.callTool({ name, arguments: args })) as Promise<CallToolResult>;
  }

  // Spawns a worker hosting the package, connects a bridged client, runs `fn`,
  // and always tears both down. The operation races against three failure
  // modes: the worker erroring, the worker exiting early (the server crashed or
  // called process.exit), and a hard timeout — so a broken server fails fast
  // rather than hanging until the timeout.
  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const worker = new Worker(WORKER_CODE, {
      eval: true,
      stdin: true,
      stdout: true,
      stderr: true,
      workerData: { pkg: this.pkg },
      env: { ...baseEnv(), ...this.env },
    });

    // Surface the server's stderr into our error messages for diagnosis; never
    // to stdout, which is the JSON-RPC channel.
    const stderrChunks: string[] = [];
    worker.stderr?.on("data", (b: Buffer) => stderrChunks.push(b.toString()));
    const withStderr = (msg: string) => {
      const tail = stderrChunks.join("").slice(-500);
      return tail ? `${msg} Server stderr: ${tail}` : msg;
    };

    const client = new Client({ name: "grossmargin-connect", version: "0.1.0" });
    const transport = new StreamTransport(worker.stdout!, worker.stdin!);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const failure = new Promise<never>((_, reject) => {
      worker.on("error", (err) =>
        reject(new Error(withStderr(`Local MCP "${this.label}" (${this.pkg}) failed: ${err.message}`))),
      );
      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(withStderr(`Local MCP "${this.label}" (${this.pkg}) exited (code ${code}).`)));
        }
      });
      timer = setTimeout(
        () => reject(new Error(withStderr(`Local MCP "${this.label}" (${this.pkg}) timed out after ${OP_TIMEOUT_MS}ms.`))),
        OP_TIMEOUT_MS,
      );
    });

    try {
      const op = (async () => {
        await client.connect(transport);
        return fn(client);
      })();
      return await Promise.race([op, failure]);
    } finally {
      if (timer) clearTimeout(timer);
      await client.close().catch(() => {});
      await worker.terminate().catch(() => {});
    }
  }
}
