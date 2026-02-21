# AgentVault

**A local credential vault and MCP proxy for AI agents. Your secrets stay encrypted. The agent never sees them.**

AgentVault stores any credential — API keys, access tokens, payment keys, database passwords — in a locally encrypted vault and injects them at runtime when the agent needs to act. The agent receives only the result of the action, never the plaintext credential. Works with Cursor, Claude Code, and any MCP-compatible AI tool.

---

## Why This Exists

### The Problem: AI Agents Are a Credential Security Nightmare

The rise of AI coding agents (Cursor, Claude Code, Windsurf, etc.) and autonomous AI agents (OpenClaw, CrewAI, AutoGPT) has created a massive, underappreciated security surface: **credentials in plaintext, one prompt injection away from theft.**

Today, when you connect an AI agent to external services, the standard practice is:

1. Copy your API key from the provider dashboard
2. Paste it into a config file (`mcp.json`, `.env`, `config.yaml`)
3. The agent reads this file and has full access to your credential

This means your Stripe secret key, GitHub PAT, Linear API token, AWS access key, database connection string — all of them sit in **plaintext JSON files** that any process on your machine can read, any malicious MCP tool can exfiltrate, and any prompt injection can extract.

#### This is not theoretical. It's happening now.

**The OpenClaw Crisis (January 2026):** OpenClaw, an open-source AI agent framework that crossed 180,000 GitHub stars, became the center of one of the largest credential exposure incidents in the AI era. Researchers using Shodan [discovered nearly 1,000 publicly accessible OpenClaw instances running without authentication](https://www.kaspersky.com/blog/openclaw-vulnerabilities-exposed/55263/). One researcher managed to extract Anthropic API keys, Telegram bot tokens, Slack credentials, and months of complete chat histories from exposed instances. [SecurityScorecard later found 40,214 exposed instances](https://www.infosecurity-magazine.com/news/researchers-40000-exposed-openclaw/), with 63% of observed deployments vulnerable — 12,812 exploitable via remote code execution.

The root cause? **OpenClaw stores API keys, passwords, and credentials in plain text** in its configuration and memory files. This became so well-known that [versions of the RedLine and Lumma infostealers have already been updated with OpenClaw file paths added to their must-steal lists](https://www.kaspersky.com/blog/moltbot-enterprise-risk-management/55317/).

**MCP Server Credential Theft (2025–2026):** The Model Context Protocol (MCP) ecosystem has its own credential crisis. [A critical vulnerability in mcp-remote (CVE-2025-6514) compromised over 437,000 developer environments](https://datasciencedojo.com/blog/mcp-security-risks-and-challenges/), with attackers gaining access to environment variables, credentials, and internal repositories. Another vulnerability (CVE-2025-54136, "MCPoison") allows attackers to [modify an already-trusted MCP config file to point to a malicious command](https://composio.dev/blog/mcp-vulnerabilities-every-developer-should-know), which Cursor executes without re-prompting the user.

As one security researcher put it: ["If you're using Claude Desktop, Cursor, Windsurf, or any other AI tool with MCP servers, your API keys are probably sitting in plain text config files — unencrypted JSON files with standard permissions that any application on your machine can read."](https://robt.uk/posts/2026-02-20-your-mcp-servers-are-probably-a-security-mess/)

**Prompt Injection + Credential Exfiltration:** The most insidious attack vector combines prompt injection with credential access. Security researchers demonstrated that [a single crafted email or web page was enough to trick exposed OpenClaw instances into exfiltrating private SSH keys and API tokens](https://www.alibabacloud.com/blog/openclaw-prompt-attacks-and-how-to-protect-your-ai-applications_602853), all without direct access to the underlying systems. Since LLMs cannot reliably separate instructions from data, a malicious tool description or a poisoned web page can instruct the agent to read its own config and send credentials to an attacker-controlled server.

**LLMjacking and Credential Cascading:** [The theft of credentials used to access LLMs has become so prevalent it has its own name: LLMjacking](https://www.csoonline.com/article/4111384/top-5-real-world-ai-security-threats-revealed-in-2025.html). Researchers estimate potential costs of over $100,000 per day when attackers query cutting-edge models using stolen API keys. In multi-agent systems, [a single compromised agent credential can give attackers access equivalent to that agent's permissions for weeks or months](https://www.mintmcp.com/blog/ai-agent-security), and when an orchestration agent holds API keys for downstream agents, compromising it grants access to all of them.

**Supply Chain Attacks on Agent Ecosystems:** The "ClawHavoc" campaign [discovered 341 malicious skills in ClawHub (12% of the registry)](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare), primarily delivering the Atomic macOS Stealer (AMOS). Updated scans report over 800 malicious skills (~20% of registry). [Docker documented MCP supply chain attack vectors](https://www.docker.com/blog/mcp-horror-stories-the-supply-chain-attack/) where malicious MCP servers embed hidden instructions in tool descriptions that most users would never see.

### The Core Issue

The fundamental problem is architectural: **credentials are treated as configuration, not as secrets.**

When you put an API key in `mcp.json` or `.env`, it becomes part of the agent's readable context. The agent — and anything that can influence the agent (prompt injection, malicious tools, compromised MCP servers) — can read, log, or exfiltrate that credential.

This applies to every type of credential:
- **Payment processing**: Stripe secret keys, PayPal client secrets
- **Source code**: GitHub PATs, GitLab tokens, Bitbucket app passwords
- **Project management**: Linear API keys, Jira tokens, Notion integrations
- **Communication**: Slack bot tokens, Discord tokens, Telegram bot tokens
- **Cloud infrastructure**: AWS access keys, GCP service accounts, Azure credentials
- **Databases**: Connection strings, Redis passwords, MongoDB URIs
- **AI services**: OpenAI/Anthropic/OpenRouter API keys
- **Any SaaS**: Any service with an API key or access token

### How AgentVault Solves This

AgentVault implements the principle that **agents should never possess credentials — they should only be able to request actions that require credentials.**

This is the same principle used by enterprise secret management systems like HashiCorp Vault, 1Password Connect, and AWS Secrets Manager, but designed specifically for the AI agent use case:

```
┌──────────────────────────────────────────────────────────────┐
│  BEFORE (insecure)                                           │
│                                                              │
│  mcp.json:                                                   │
│    { "env": { "STRIPE_KEY": "sk_live_xxxxxxxxx" } }         │
│                                                              │
│  Agent reads config → has credential → can leak it           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  AFTER (AgentVault)                                          │
│                                                              │
│  mcp.json:                                                   │
│    { "command": "agentvault", "args": ["proxy", ...] }      │
│                                                              │
│  Agent sends request → AgentVault injects credential →       │
│  Agent receives only the result → credential never exposed   │
└──────────────────────────────────────────────────────────────┘
```

Specifically:

1. **Credentials are encrypted at rest** (AES-256-GCM) in a local vault — not in plaintext config files
2. **The agent never sees the credential** — AgentVault injects it at the transport layer (HTTP header) or executes the action server-side and returns only the result
3. **Every credential access is audited** in a tamper-evident, hash-chained log
4. **Policy enforcement** restricts which hosts, methods, and paths the agent can access
5. **Prompt injection cannot extract credentials** because they never enter the LLM's context window

This follows the [zero standing privileges (ZSP) approach recommended by CyberArk](https://www.cyberark.com/resources/blog/ai-agents-and-identity-risks-how-security-will-shift-in-2026) and the [secretless architecture advocated by security researchers](https://securityboulevard.com/2025/09/securing-ai-agents-and-llm-workflows-without-secrets/) — agents are granted the ability to perform actions, not the credentials to perform them.

---

## How It Works

AgentVault operates in two modes:

### Proxy Mode — Transparent credential injection for any MCP server

```
Cursor / Claude Code              AgentVault Proxy              Remote MCP Server
       │                                │                              │
       │── JSON-RPC request ──────────>│                              │
       │   (no credentials)            │── inject auth header ──────>│
       │                               │   (from encrypted vault)     │
       │                               │<── response ────────────────│
       │<── response ─────────────────│                              │
       │   (result only)              │── audit log entry            │
```

Your `mcp.json` contains only the proxy command — no API keys. AgentVault decrypts the credential from the vault and injects it into the HTTP request header. The agent never sees it.

### Serve Mode — Vault-backed action execution

```
Cursor / Claude Code              AgentVault MCP Server
       │                                │
       │── "call Stripe API" ─────────>│
       │   {action, params}            │── decrypt STRIPE_KEY from vault
       │                               │── execute API call
       │                               │── audit log entry
       │<── result only ──────────────│
       │   (credential never exposed)  │
```

The agent requests an action. AgentVault decrypts the required credential internally, executes the action, and returns only the result. The credential never enters the agent's context.

---

## Prerequisites

- Node.js 20+
- npm

---

## Setup

```bash
# 1. Install dependencies (no native modules, pure JS)
npm install

# 2. Build
npm run build

# 3. Store any credential in the encrypted vault
npx tsx src/index.ts kv put STRIPE_SECRET_KEY
# paste your key when prompted — encrypted with AES-256-GCM

npx tsx src/index.ts kv put LINEAR_API_KEY
npx tsx src/index.ts kv put GITHUB_TOKEN
npx tsx src/index.ts kv put OPENAI_API_KEY
# ... any credential you want to protect
```

Secrets are stored at `~/.config/agentvault/vault.json` (encrypted). The data encryption key is derived from your machine identity via PBKDF2 (100k iterations, SHA-512) and stored at `~/.config/agentvault/dek.enc`.

---

## Cursor Integration

Add one or both modes to **`~/.cursor/mcp.json`**:

### Mode 1: Serve Mode (vault-backed tools for agents)

AgentVault runs as an MCP server exposing vault-backed tools. Agents can perform actions that require credentials without ever seeing them.

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/composer_hackathon/src/index.ts", "serve"]
    }
  }
}
```

### Mode 2: Proxy Mode (transparent auth injection for any MCP server)

AgentVault sits between Cursor and a remote MCP server. It injects your API key into requests automatically.

```bash
# Store your API key
npx tsx src/index.ts kv put mcp/context7/API_KEY

# Create a profile
npx tsx src/index.ts profile add context7 \
  --url https://mcp.context7.com/mcp \
  --header CONTEXT7_API_KEY \
  --secret mcp/context7/API_KEY

# Print the Cursor config snippet
npx tsx src/index.ts print-cursor-config context7
```

Then add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "context7": {
      "command": "node",
      "args": ["/absolute/path/to/composer_hackathon/bin/agentvault", "proxy", "--profile", "context7"]
    }
  }
}
```

### Using both modes together

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/composer_hackathon/src/index.ts", "serve"]
    },
    "context7": {
      "command": "node",
      "args": ["/absolute/path/to/composer_hackathon/bin/agentvault", "proxy", "--profile", "context7"]
    }
  }
}
```

After editing `mcp.json`, restart Cursor (`Cmd+Shift+P` → "Reload Window").

### Claude Code Integration

For Claude Code, add to `~/.claude/mcp.json` using the same format as above.

---

## Web Gateway UI

AgentVault also includes a web-based approval gateway. Agents submit action requests via API, and a human approves or denies them in the browser before execution.

```bash
# Start the web UI
npm run dev:web
# Open http://localhost:3000
```

Pages:
- **Vault** — Add and list secrets (values never displayed)
- **Approvals** — Approve or deny pending agent requests
- **Logs** — Audit trail of all actions

Set `VAULT_MASTER_PASSWORD` in `.env` before starting (see `.env.example`).

---

## MCP Tools (Serve Mode)

| Tool | Description |
|------|-------------|
| `vault_git_push` | Push code to a remote. Retrieves token from vault, authenticates via temp remote, pushes, cleans up. Token never returned to agent. |
| `vault_create_issue` | Create a GitHub issue. Retrieves token from vault, calls API, returns `{html_url, number, title}`. Token never exposed. |
| `vault_status` | Show stored secret names (never values) and audit log entry count. |

These are examples — AgentVault can be extended to wrap any API call (Stripe charges, Linear issues, Slack messages, database queries) with vault-backed credential injection.

---

## CLI Reference

```bash
# Secret management (any credential type)
agentvault kv put <path>          # Store a secret (interactive prompt)
agentvault kv list <prefix>       # List secret paths
agentvault kv delete <path>       # Delete a secret

# MCP server
agentvault serve                  # Start MCP server (stdio) for Cursor/Claude Code

# MCP proxy (forward to remote MCP with auth injection)
agentvault proxy --profile <name> # Start proxy for a configured profile

# Profiles (for proxy mode)
agentvault profile add <name> --url <url> --header <name> --secret <path>
agentvault profile list
agentvault profile delete <name>
agentvault print-cursor-config <profile>

# Audit
agentvault audit verify           # Verify hash chain integrity

# Approval (for proxy mode with --approval-mode cli)
agentvault approve <leaseId>
agentvault deny <leaseId>
agentvault tui                    # TUI approval interface
```

---

## Security Model

- **Encryption at rest**: AES-256-GCM with unique data encryption keys per secret
- **DEK protection**: Encrypted with a key derived from machine identity (PBKDF2, SHA-512, 100k iterations)
- **No plaintext exposure**: Agent receives only action results, never credentials
- **Prompt injection resistant**: Credentials never enter the LLM context window — there is nothing to extract
- **Audit logging**: SHA-256 hash-chained log — every access recorded, tamper-evident
- **Policy enforcement**: Host allowlisting, blocked private IP ranges, method/path restrictions
- **Credential isolation**: Credentials decrypted only at the moment of use, in memory only, never logged or returned

---

## Project Structure

```
src/
├── index.ts              # CLI entry point (Commander)
├── mcp/
│   └── serve.ts          # MCP server mode — vault-backed tools
├── vault/
│   ├── crypto.ts         # AES-256-GCM encrypt/decrypt
│   ├── keychain.ts       # DEK storage (encrypted file)
│   └── store.ts          # Encrypted secret store (JSON)
├── proxy/
│   ├── server.ts         # MCP proxy mode
│   ├── serve.ts          # MCP serve mode (vault tools over stdio)
│   ├── stdio-proxy.ts    # stdio JSON-RPC forwarding
│   ├── forwarder.ts      # HTTP forwarding with auth injection
│   └── policy.ts         # Request validation & host blocking
├── audit/
│   └── log.ts            # Hash-chained audit log
├── lease/
│   └── lease.ts          # Approval lease management
├── profile/
│   └── profile.ts        # Profile configuration
├── cli/
│   ├── kv.ts             # Secret CLI commands
│   ├── profile-cli.ts    # Profile CLI commands
│   └── print-cursor-config.ts
└── tui/
    └── approval.ts       # Terminal UI for approvals

app/                       # Next.js web gateway UI
├── page.tsx              # Home page
├── vault/page.tsx        # Secret management
├── approvals/page.tsx    # Request approval dashboard
├── logs/page.tsx         # Audit log viewer
└── api/                  # API routes for gateway

lib/                       # Gateway server-side logic
├── crypto.ts             # AES-256-GCM (web gateway)
├── handlers.ts           # Action execution
├── store.ts              # In-memory request & log store
└── vault.ts              # Encrypted vault read/write
```

---

## References

- [New OpenClaw AI agent found unsafe for use — Kaspersky](https://www.kaspersky.com/blog/openclaw-vulnerabilities-exposed/55263/)
- [Researchers Find 40,000+ Exposed OpenClaw Instances — Infosecurity Magazine](https://www.infosecurity-magazine.com/news/researchers-40000-exposed-openclaw/)
- [Personal AI Agents like OpenClaw Are a Security Nightmare — Cisco](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare)
- [OpenClaw proves agentic AI works. It also proves your security model doesn't. — VentureBeat](https://venturebeat.com/security/openclaw-agentic-ai-security-risk-ciso-guide)
- [Your MCP Servers Are Probably a Security Mess — Rob Taylor](https://robt.uk/posts/2026-02-20-your-mcp-servers-are-probably-a-security-mess/)
- [The State of MCP Security in 2025 — Data Science Dojo](https://datasciencedojo.com/blog/mcp-security-risks-and-challenges/)
- [MCP Horror Stories: The Supply Chain Attack — Docker](https://www.docker.com/blog/mcp-horror-stories-the-supply-chain-attack/)
- [MCP Vulnerabilities Every Developer Should Know — Composio](https://composio.dev/blog/mcp-vulnerabilities-every-developer-should-know)
- [AI agents and identity risks — CyberArk](https://www.cyberark.com/resources/blog/ai-agents-and-identity-risks-how-security-will-shift-in-2026)
- [Securing AI Agents and LLM Workflows Without Secrets — Security Boulevard](https://securityboulevard.com/2025/09/securing-ai-agents-and-llm-workflows-without-secrets/)
- [AI agent security: the complete enterprise guide for 2026 — MintMCP](https://www.mintmcp.com/blog/ai-agent-security)
- [Top 5 real-world AI security threats revealed in 2025 — CSO Online](https://www.csoonline.com/article/4111384/top-5-real-world-ai-security-threats-revealed-in-2025.html)

---

## License

MIT
