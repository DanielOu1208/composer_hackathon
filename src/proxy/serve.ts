import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { putSecret, getSecret, listSecrets, deleteSecret } from "../vault/store.js";
import { appendAudit, verifyAuditChain } from "../audit/log.js";

/**
 * Start the AgentVault MCP server in standalone mode.
 * Exposes vault tools (get/put/list/delete secrets, audit) over stdio.
 */
export async function startServeServer(): Promise<void> {
  const server = new McpServer({
    name: "agentvault",
    version: "1.0.0",
  });

  server.registerTool(
    "agentvault_ping",
    {
      description: "Verify AgentVault MCP server connectivity. Returns pong.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ pong: true }) }],
    })
  );

  server.registerTool(
    "agentvault_get_secret",
    {
      description: "Retrieve a secret by path (e.g. mcp/context7/API_KEY). Returns the decrypted value.",
      inputSchema: { path: z.string().describe("Secret path") },
    },
    async ({ path }) => {
      const value = await getSecret(path);
      if (value === null) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Secret not found", path }) }],
          isError: true,
        };
      }
      appendAudit("mcp-agent", "PROXY_EXECUTED", path, "secret_read");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ path, value }) }],
      };
    }
  );

  server.registerTool(
    "agentvault_put_secret",
    {
      description: "Store a secret at a given path.",
      inputSchema: {
        path: z.string().describe("Secret path (e.g. mcp/myservice/API_KEY)"),
        value: z.string().describe("Secret value to store"),
      },
    },
    async ({ path, value }) => {
      await putSecret(path, value);
      appendAudit("mcp-agent", "SECRET_CREATED", path, "ok");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ stored: true, path }) }],
      };
    }
  );

  server.registerTool(
    "agentvault_list_secrets",
    {
      description: "List secret paths under a prefix (e.g. mcp/).",
      inputSchema: {
        prefix: z.string().describe("Path prefix to list"),
      },
    },
    async ({ prefix }) => {
      const paths = await listSecrets(prefix);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ prefix, paths }) }],
      };
    }
  );

  server.registerTool(
    "agentvault_delete_secret",
    {
      description: "Delete a secret at a given path.",
      inputSchema: {
        path: z.string().describe("Secret path to delete"),
      },
    },
    async ({ path }) => {
      const deleted = await deleteSecret(path);
      if (deleted) {
        appendAudit("mcp-agent", "SECRET_DELETED", path, "ok");
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ deleted, path }) }],
      };
    }
  );

  server.registerTool(
    "agentvault_audit_verify",
    {
      description: "Verify the integrity of the audit hash chain.",
      inputSchema: {},
    },
    async () => {
      const result = verifyAuditChain();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
