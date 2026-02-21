#!/usr/bin/env node

import { Command } from "commander";
import { startProxyServer } from "./proxy/server.js";
import { startServeServer } from "./proxy/serve.js";
import { printCursorConfig } from "./cli/print-cursor-config.js";
import { kvPut, kvList, kvDelete } from "./cli/kv.js";
import { profileAdd, profileList, profileDelete } from "./cli/profile-cli.js";
import { approveLease, denyLease } from "./lease/lease.js";
import { runApprovalTui } from "./tui/approval.js";
import { verifyAuditChain } from "./audit/log.js";

const program = new Command();

program
  .name("agentvault")
  .description("Local MCP secret management proxy - TeamVault-inspired")
  .version("1.0.0");

program
  .command("proxy")
  .description("Start MCP proxy server (stdio)")
  .requiredOption("--profile <name>", "Profile name for remote MCP configuration")
  .option("--approval-mode <mode>", "Approval mode: none (default) or cli", "none")
  .action(async (opts: { profile: string; approvalMode: string }) => {
    await startProxyServer({
      profile: opts.profile,
      approvalMode: opts.approvalMode === "cli" ? "cli" : "none",
    });
  });

program
  .command("serve")
  .description("Start AgentVault MCP server (register in Cursor mcp.json)")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/serve.js");
    await startMcpServer();
  });

program
  .command("print-cursor-config <profile>")
  .description("Print Cursor mcp.json configuration snippet for a profile")
  .action((profile: string) => {
    printCursorConfig(profile);
  });

program
  .command("tui")
  .description("Launch TUI approval interface (run in separate terminal)")
  .action(async () => {
    await runApprovalTui();
  });

const kv = program.command("kv").description("Secret management");

kv.command("put <path>")
  .description("Store a secret at path (e.g. mcp/context7/API_KEY)")
  .action(async (path: string) => {
    await kvPut(path);
  });

kv.command("list <prefix>")
  .description("List secret paths under prefix (e.g. mcp/)")
  .action(async (prefix: string) => {
    await kvList(prefix);
  });

kv.command("delete <path>")
  .description("Delete secret at path")
  .action(async (path: string) => {
    await kvDelete(path);
  });

const profileCmd = program.command("profile").description("Profile management");

profileCmd
  .command("add <name>")
  .description("Add a profile for remote MCP")
  .requiredOption("--url <url>", "Remote MCP URL (e.g. https://mcp.context7.com/mcp)")
  .requiredOption("--header <name>", "Header name for auth (e.g. CONTEXT7_API_KEY)")
  .requiredOption("--secret <path>", "Secret path (e.g. mcp/context7/API_KEY)")
  .action((name: string, opts: { url: string; header: string; secret: string }) => {
    profileAdd(name, opts);
  });

profileCmd.command("list").description("List profiles").action(() => {
  profileList();
});

profileCmd
  .command("delete <name>")
  .description("Delete a profile")
  .action((name: string) => {
    profileDelete(name);
  });

program
  .command("approve <leaseId>")
  .description("Approve a pending proxy request (run in another terminal)")
  .action((leaseId: string) => {
    if (approveLease(leaseId)) {
      console.error(`Approved ${leaseId}`);
    } else {
      console.error(`Lease ${leaseId} not found or already resolved`);
      process.exit(1);
    }
  });

program
  .command("deny <leaseId>")
  .description("Deny a pending proxy request")
  .action((leaseId: string) => {
    if (denyLease(leaseId)) {
      console.error(`Denied ${leaseId}`);
    } else {
      console.error(`Lease ${leaseId} not found or already resolved`);
      process.exit(1);
    }
  });

const auditCmd = program.command("audit").description("Audit log");

auditCmd
  .command("verify")
  .description("Verify hash chain integrity of audit log")
  .action(() => {
    const result = verifyAuditChain();
    if (result.valid) {
      console.log("Audit chain OK");
    } else {
      console.error("Audit chain INVALID:", result.error);
      process.exit(1);
    }
  });

program.parse();
