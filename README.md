# AgentVault

Local MCP credential vault for AI agents. Stores secrets encrypted at rest (AES-256-GCM), exposes vault-backed tools via MCP, and executes actions on behalf of the agent. **The agent never sees plaintext secrets.**

When you use Cursor, Claude Code, or any MCP-compatible agent, API keys typically sit in plaintext in config files. AgentVault eliminates that. Secrets stay encrypted in a local vault. The agent calls a tool like `vault_git_push` — AgentVault retrieves the credential internally, executes the action, and returns only the result.

---

## How it works

```
Agent (Cursor)                    AgentVault (MCP server)
     │                                   │
     │  "push this to GitHub"            │
     │ ─── vault_git_push ──────────────>│
     │     {owner, repo, branch}         │
     │                                   │── decrypt GITHUB_TOKEN from vault
     │                                   │── git push (token never leaves server)
     │                                   │── audit log entry
     │  <── result ─────────────────────│
     │  "Pushed to github.com/..."       │
     │                                   │
     │  (token never in prompt/context)  │
```

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

# 3. Store your GitHub token in the encrypted vault
npx tsx src/index.ts kv put GITHUB_TOKEN
# paste your GitHub PAT when prompted — it's encrypted with AES-256-GCM
```

Secrets are stored at `~/.config/agentvault/vault.json` (encrypted). The data encryption key is derived from your machine identity and stored at `~/.config/agentvault/dek.enc`.

---

## Cursor Integration

AgentVault works with Cursor in two modes. Add one or both to **`~/.cursor/mcp.json`**:

### Mode 1: Serve Mode (vault-backed tools for agents)

AgentVault runs as an MCP server. Agents can push to GitHub, create issues, and check vault status — all without ever seeing your tokens.

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

AgentVault sits between Cursor and a remote MCP server (e.g. Context7). It injects your API key into requests automatically — no key in your config.

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

AgentVault also includes a web-based approval gateway. Agents submit action requests via API, and humans approve or deny them in a browser.

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
| `vault_git_push` | Push code to a GitHub remote. Retrieves `GITHUB_TOKEN` from vault, authenticates via temp remote, pushes, cleans up. Token never returned. |
| `vault_create_issue` | Create a GitHub issue. Retrieves `GITHUB_TOKEN` from vault, calls GitHub REST API, returns `{html_url, number, title}`. |
| `vault_status` | Show stored secret names (never values) and audit log entry count. |

---

## CLI Reference

```bash
# Secret management
agentvault kv put <path>          # Store a secret (interactive prompt)
agentvault kv list <prefix>       # List secret paths
agentvault kv delete <path>       # Delete a secret

# MCP server
agentvault serve                  # Start MCP server (stdio) for Cursor

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

## Demo Script (3 min pitch)

### 1. The problem (30s)

> "Every developer using Cursor or Claude Code pastes API keys into mcp.json in plaintext. If a prompt injection or malicious tool leaks the config, your tokens are gone."

### 2. Store a secret (20s)

```bash
npx tsx src/index.ts kv put GITHUB_TOKEN
# enter your GitHub PAT
```

### 3. Show the Cursor config (20s)

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "npx",
      "args": ["tsx", ".../src/index.ts", "serve"]
    }
  }
}
```

> "No API key anywhere in config. Just a command that starts AgentVault."

### 4. Live demo in Cursor (60s)

Tell the agent: *"Push this code to github.com/myuser/myrepo"*

The agent calls `vault_git_push`. AgentVault:
1. Decrypts GITHUB_TOKEN from the local vault
2. Creates a temporary authenticated git remote
3. Pushes the code
4. Removes the temp remote
5. Returns only: "Successfully pushed branch 'main' to https://github.com/myuser/myrepo"

The token never appears in the agent's context.

Then: *"Create a GitHub issue titled 'Hello from AgentVault'"*

The agent calls `vault_create_issue`. Same flow — token stays in the vault.

### 5. Audit trail (30s)

```bash
npx tsx src/index.ts audit verify
# → Audit chain OK
```

> "Every credential access is recorded in a tamper-evident, hash-chained audit log. If anyone modifies a log entry, the chain breaks."

---

## Security Model

- **Encryption at rest**: AES-256-GCM with per-secret data encryption keys
- **DEK protection**: Encrypted with a key derived from machine identity (PBKDF2, 100k iterations)
- **No plaintext exposure**: Agent receives only action results, never credentials
- **Audit logging**: SHA-256 hash-chained log — every access recorded, tamper-evident
- **Policy enforcement**: Host allowlisting, blocked private IP ranges, method/path restrictions
- **Temp credential handling**: Git remotes created and destroyed per-push; tokens sanitized from error messages

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
    ├── approve/route.ts
    ├── request/route.ts
    ├── requests/route.ts
    ├── logs/route.ts
    └── vault/
        ├── set/route.ts
        └── list/route.ts

lib/                       # Gateway server-side logic
├── crypto.ts             # AES-256-GCM (web gateway)
├── handlers.ts           # Action execution (GitHub API, etc.)
├── store.ts              # In-memory request & log store
└── vault.ts              # Encrypted vault read/write
```

---

## License

MIT
