import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getProfile } from "../profile/profile.js";
import { runStdioProxy } from "./stdio-proxy.js";

export interface ProxyServerOptions {
  profile: string;
  approvalMode?: "none" | "cli";
}

/**
 * Starts the AgentVault MCP proxy.
 * If profile exists: forwards all JSON-RPC to remote with auth injection.
 * If no profile: runs placeholder MCP server (Phase 1 fallback).
 */
export async function startProxyServer(options: ProxyServerOptions): Promise<void> {
  const { profile: profileName, approvalMode = "none" } = options;

  const profile = getProfile(profileName);
  if (profile) {
    runStdioProxy(profile, profileName, approvalMode);
    return;
  }

  // Fallback: placeholder server when no profile configured
  const server = new McpServer({
    name: "agentvault",
    version: "1.0.0",
  });

  server.registerTool(
    "agentvault_ping",
    {
      description: "Verify AgentVault MCP proxy connectivity. Returns pong.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              pong: true,
              profile: profileName,
              message: "AgentVault proxy is connected (no profile configured)",
            }),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
