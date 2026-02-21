import type { Profile } from "../profile/profile.js";
import { forwardMessage } from "./forwarder.js";
import { setLeaseRequestHandler } from "../lease/lease.js";

function serializeMessage(msg: unknown): string {
  return JSON.stringify(msg) + "\n";
}

/**
 * Run the stdio proxy: read JSON-RPC from stdin, forward to remote, write to stdout.
 */
export function runStdioProxy(
  profile: Profile,
  profileName: string,
  approvalMode: "none" | "cli" = "none"
): void {
  if (approvalMode === "cli") {
    setLeaseRequestHandler((lease) => {
      process.stderr.write(
        `\n[AgentVault] Pending request: ${lease.id}\n` +
          `  Profile: ${lease.profile} | ${lease.method} ${lease.path}\n` +
          `  Run: agentvault approve ${lease.id}  or  agentvault deny ${lease.id}\n\n`
      );
    });
  }

  let buffer = "";

  process.stdin.on("data", async (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as unknown;
        const response = await forwardMessage(
          message,
          profile,
          profileName,
          (m) => (typeof m === "string" ? m : serializeMessage(m)),
          approvalMode === "cli"
        );
        if (response) {
          process.stdout.write(response);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorResponse = {
          jsonrpc: "2.0",
          id: 0,
          error: { code: -32700, message: `Parse error: ${errorMsg}` },
        };
        process.stdout.write(serializeMessage(errorResponse));
      }
    }
  });
}
