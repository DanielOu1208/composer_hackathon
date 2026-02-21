# AgentVault

Local MCP secret management proxy – TeamVault-inspired. Eliminates API keys from Cursor MCP config by using envelope encryption, policy enforcement, and runtime credential injection.

## Quick Start

```bash
# Install
npm install
npm run build
npm link   # or: npm install -g .

# Store a secret
agentvault kv put mcp/context7/API_KEY
# Enter your Context7 API key when prompted

# Add a profile
agentvault profile add context7 \
  --url https://mcp.context7.com/mcp \
  --header CONTEXT7_API_KEY \
  --secret mcp/context7/API_KEY

# Get Cursor config
agentvault print-cursor-config context7
# Copy the output into your Cursor mcp.json
```

## Cursor Configuration

Add to `~/.cursor/mcp.json` (or your Cursor MCP config):

```json
{
  "mcpServers": {
    "context7": {
      "command": "agentvault",
      "args": ["proxy", "--profile", "context7"]
    }
  }
}
```

No API keys in config. AgentVault injects credentials at runtime.

## Commands

| Command | Description |
|---------|-------------|
| `agentvault proxy --profile <name>` | Start MCP proxy (stdio) |
| `agentvault proxy --profile <name> --approval-mode cli` | Proxy with CLI approval |
| `agentvault kv put <path>` | Store secret (e.g. mcp/context7/API_KEY) |
| `agentvault kv list <prefix>` | List secrets under prefix |
| `agentvault kv delete <path>` | Delete secret |
| `agentvault profile add <name> --url --header --secret` | Add profile |
| `agentvault profile list` | List profiles |
| `agentvault profile delete <name>` | Delete profile |
| `agentvault print-cursor-config <profile>` | Print Cursor mcp.json snippet |
| `agentvault approve <leaseId>` | Approve pending request (CLI mode) |
| `agentvault deny <leaseId>` | Deny pending request |
| `agentvault tui` | Launch TUI approval interface |
| `agentvault audit verify` | Verify audit log hash chain |

## Architecture

- **Secrets**: Encrypted with AES-256-GCM; DEK stored in macOS Keychain
- **Profiles**: Stored at `~/.config/agentvault/profiles.json`
- **Audit**: Hash-chained log at `~/.config/agentvault/audit.db`

## Security

- Default deny policy
- Exact hostname matching (no IP literals, localhost, or private ranges)
- Response size limits
- Lease-based approval (optional)
- Tamper-evident audit log
