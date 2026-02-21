import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getSecret } from "../vault/store.js";
import { appendAudit } from "../audit/log.js";

const VAULT_DIR = join(homedir(), ".config", "agentvault");
const VAULT_PATH = join(VAULT_DIR, "vault.json");
const AUDIT_PATH = join(VAULT_DIR, "audit.json");

/**
 * Try to retrieve a secret by name, checking both bare and mcp/-prefixed paths.
 * Falls back to environment variable.
 */
async function resolveSecret(name: string): Promise<string | null> {
  // Try bare path first (e.g. "GITHUB_TOKEN")
  let value = await getSecret(name);
  if (value) return value;

  // Try mcp/-prefixed path (e.g. "mcp/GITHUB_TOKEN")
  value = await getSecret(`mcp/${name}`);
  if (value) return value;

  // Fall back to environment variable
  return process.env[name] ?? null;
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "agentvault",
    version: "1.0.0",
  });

  // ── Tool 1: vault_git_push ──────────────────────────────────────────
  server.registerTool(
    "vault_git_push",
    {
      description:
        "Push current branch to a GitHub remote. AgentVault retrieves the stored GITHUB_TOKEN from the encrypted vault and authenticates the push. The agent never sees the token.",
      inputSchema: {
        owner: z.string().describe("GitHub repository owner"),
        repo: z.string().describe("GitHub repository name"),
        branch: z
          .string()
          .optional()
          .describe("Branch to push (defaults to current branch)"),
      },
    },
    async ({ owner, repo, branch }) => {
      const token = await resolveSecret("GITHUB_TOKEN");
      if (!token) {
        appendAudit("agent", "BLOCKED_BY_POLICY", "vault_git_push", "GITHUB_TOKEN not found");
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: GITHUB_TOKEN not stored in vault. Run: agentvault kv put mcp/GITHUB_TOKEN",
            },
          ],
        };
      }

      const resolvedBranch =
        branch ??
        execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();

      const cwd = process.cwd();
      const remoteName = `agentvault-temp-${Date.now()}`;

      try {
        execSync(
          `git remote add ${remoteName} https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
          { cwd, stdio: "pipe" }
        );
        execSync(`git push ${remoteName} ${resolvedBranch}`, {
          cwd,
          stdio: "pipe",
        });

        appendAudit(
          "agent",
          "PROXY_EXECUTED",
          `git push ${owner}/${repo} ${resolvedBranch}`,
          "success"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully pushed branch '${resolvedBranch}' to https://github.com/${owner}/${repo}`,
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error during git push";
        // Sanitize: never include the token in error output
        const safeMessage = message.replace(token, "***");

        appendAudit(
          "agent",
          "PROXY_EXECUTED",
          `git push ${owner}/${repo} ${resolvedBranch}`,
          "error"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error pushing to ${owner}/${repo}: ${safeMessage}`,
            },
          ],
        };
      } finally {
        try {
          execSync(`git remote remove ${remoteName}`, {
            cwd,
            stdio: "pipe",
          });
        } catch {
          // remote may not exist if add failed
        }
      }
    }
  );

  // ── Tool 2: vault_create_issue ──────────────────────────────────────
  server.registerTool(
    "vault_create_issue",
    {
      description:
        "Create a GitHub issue. AgentVault retrieves GITHUB_TOKEN from the encrypted vault and calls the GitHub API. The agent never sees the token.",
      inputSchema: {
        owner: z.string().describe("GitHub repository owner"),
        repo: z.string().describe("GitHub repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().optional().describe("Issue body (markdown)"),
      },
    },
    async ({ owner, repo, title, body }) => {
      const token = await resolveSecret("GITHUB_TOKEN");
      if (!token) {
        appendAudit("agent", "BLOCKED_BY_POLICY", "vault_create_issue", "GITHUB_TOKEN not found");
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: GITHUB_TOKEN not stored in vault. Run: agentvault kv put mcp/GITHUB_TOKEN",
            },
          ],
        };
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title, body: body || "" }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          appendAudit(
            "agent",
            "PROXY_EXECUTED",
            `create issue ${owner}/${repo}`,
            "error"
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating issue (${response.status}): ${errorText}`,
              },
            ],
          };
        }

        const data = (await response.json()) as {
          html_url: string;
          number: number;
          title: string;
        };

        appendAudit(
          "agent",
          "PROXY_EXECUTED",
          `create issue ${owner}/${repo} #${data.number}`,
          "success"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                html_url: data.html_url,
                number: data.number,
                title: data.title,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error creating issue";

        appendAudit(
          "agent",
          "PROXY_EXECUTED",
          `create issue ${owner}/${repo}`,
          "error"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating issue: ${message}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 3: vault_status ────────────────────────────────────────────
  server.registerTool(
    "vault_status",
    {
      description:
        "Show AgentVault status: stored secret names (never values), audit log entry count.",
      inputSchema: {},
    },
    async () => {
      // Read secret names directly from vault.json
      let secretNames: string[] = [];
      if (existsSync(VAULT_PATH)) {
        try {
          const raw = readFileSync(VAULT_PATH, "utf-8");
          const data = JSON.parse(raw) as { secrets: Record<string, string> };
          secretNames = Object.keys(data.secrets).sort();
        } catch {
          // vault file corrupted or unreadable
        }
      }

      // Count audit entries
      let auditCount = 0;
      if (existsSync(AUDIT_PATH)) {
        try {
          const raw = readFileSync(AUDIT_PATH, "utf-8");
          const data = JSON.parse(raw) as { entries: unknown[] };
          auditCount = data.entries.length;
        } catch {
          // audit file corrupted or unreadable
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              secrets: secretNames,
              count: secretNames.length,
              auditEntries: auditCount,
              note: "Values are encrypted at rest. Use vault-backed tools to execute actions.",
            }),
          },
        ],
      };
    }
  );

  // ── Start server ────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "AgentVault MCP server started (tools: vault_git_push, vault_create_issue, vault_status)"
  );
}
