import "server-only";
import type { Readable, Writable } from "node:stream";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";

// An MCP client Transport over an arbitrary Readable (server -> client) and
// Writable (client -> server), reusing the SDK's newline-delimited JSON framing.
// This is exactly what StdioClientTransport does internally, minus the process
// spawn — so we can drive a stdio MCP server whose stdio we've already wired to
// a worker thread's streams. Node-only.
export class StreamTransport implements Transport {
  private readBuffer = new ReadBuffer();
  private started = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  constructor(
    private readonly readable: Readable,
    private readonly writable: Writable,
  ) {}

  async start(): Promise<void> {
    if (this.started) throw new Error("StreamTransport already started.");
    this.started = true;
    this.readable.on("data", (chunk: Buffer) => {
      this.readBuffer.append(chunk);
      this.flush();
    });
    this.readable.on("error", (err) => this.onerror?.(err));
    this.readable.on("close", () => this.onclose?.());
  }

  private flush(): void {
    for (;;) {
      let message: JSONRPCMessage | null;
      try {
        message = this.readBuffer.readMessage();
      } catch (err) {
        this.onerror?.(err as Error);
        return;
      }
      if (message === null) break;
      this.onmessage?.(message);
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.writable.write(serializeMessage(message), (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.readBuffer.clear();
    this.onclose?.();
  }
}
