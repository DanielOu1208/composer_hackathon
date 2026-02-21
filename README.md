# AgentVault

**Local permissioned execution gateway for Cursor.** Secrets stored encrypted at rest (AES-256-GCM). Human approval required before any action. Gateway executes on behalf of the agent; the agent only receives the result and **never** sees plaintext secrets. No env injection, no Postgres, demo-ready.

Inspired by [TeamVault](https://github.com/wanot-ai/teamvault); this is a minimal conversion to a **local, Cursor-only** gateway (no Go backend, no `kv get`, no env injection). See [AGENTVAULT.md](./AGENTVAULT.md) for the full conversion plan.

---

## Architecture (short)

- **Agent** sends `POST /api/request` with `action` + `params`. Gets back `requestId` and `status: "pending"`. Never receives secrets or ciphertext.
- **Gateway** is Next.js only (API routes + UI). Vault = one file `vault.enc.json` (encrypted). Requests and logs in memory.
- **Human** adds secrets via UI (Vault), approves/denies via Approvals page. No RBAC for MVP.
- **Execution:** On approve, gateway runs the handler (e.g. `github_create_issue`), decrypts only the needed secret in memory, calls GitHub API, returns result. Secret never logged or returned.

---

## Folder structure

```
├── app/
│   ├── api/
│   │   ├── vault/set/route.ts, vault/list/route.ts   # UI only (names only from list)
│   │   ├── request/route.ts   # POST – create pending
│   │   ├── requests/route.ts  # GET – list requests
│   │   ├── approve/route.ts   # POST – approve/deny + execute
│   │   └── logs/route.ts      # GET – audit
│   ├── vault/page.tsx, approvals/page.tsx, logs/page.tsx
│   ├── layout.tsx, page.tsx, globals.css
├── lib/
│   ├── crypto.ts   # AES-256-GCM + PBKDF2
│   ├── vault.ts    # vault.enc.json
│   ├── store.ts    # in-memory requests + logs
│   └── handlers.ts # github_create_issue
├── package.json, tsconfig.json, next.config.js, .env.example, .gitignore
└── README.md, AGENTVAULT.md
```

---

## Converting from TeamVault repo

If you start from [wanot-ai/teamvault](https://github.com/wanot-ai/teamvault):

**Delete:** Go backend (`bin/`, `cmd/`, `internal/`, `go.mod`, `go.sum`, `Makefile`, `Dockerfile`, `docker-compose.yml`), CLI that exposes `kv get`, env-injection code (`extension/`, `teamvault run`–style, `integrations/openclaw` if injection-only), `migrations/`, and optionally `kubernetes/`, `terraform/`, `tests/` that depend on the old stack.

**Create:** All files in the folder structure above (see [AGENTVAULT.md](./AGENTVAULT.md) for the exact list and API examples).

This repo is already AgentVault; use it as the reference implementation.

---

## Run locally on Windows (step-by-step)

1. **Prerequisites:** Node.js 18+ and npm.
2. **Install dependencies:**
   ```bat
   npm install
   ```
3. **Set master password (required):**
   ```bat
   set VAULT_MASTER_PASSWORD=your-secure-master-password
   ```
4. **Optional (for GitHub demo):** Add `GITHUB_TOKEN` via the Vault UI after starting, or set env:
   ```bat
   set GITHUB_TOKEN=ghp_xxxx
   ```
5. **Start dev server:**
   ```bat
   npm run dev
   ```
6. **Open browser:** http://localhost:3000
7. **Vault:** Open "Vault", add a secret with name `GITHUB_TOKEN` and your token value.
8. **Agent request (e.g. from Cursor or curl):**
   ```bat
   curl -X POST http://localhost:3000/api/request -H "Content-Type: application/json" -d "{\"action\":\"github_create_issue\",\"params\":{\"owner\":\"YOUR_GITHUB_USER\",\"repo\":\"YOUR_REPO\",\"title\":\"Test issue from AgentVault\"}}"
   ```
   Response: `{ "ok": true, "requestId": "req_...", "status": "pending", "message": "Awaiting human approval." }`
9. **Approvals:** Open "Approvals", find the pending request, click **Approve**. Gateway creates the issue and shows the result (e.g. `html_url`). Secret is never returned.

---

## API summary

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/vault/set | Store encrypted secret (UI only) |
| GET | /api/vault/list | List secret **names** only (UI only) |
| POST | /api/request | Create pending action |
| GET | /api/requests | List all requests |
| POST | /api/approve | Approve or deny; if approved, execute handler |
| GET | /api/logs | Audit logs |

---

## Demo action: `github_create_issue`

- **Params:** `owner`, `repo`, `title`, `body` (optional).
- **Secret:** `GITHUB_TOKEN` from vault (or `process.env.GITHUB_TOKEN` for dev).
- **Flow:** Agent posts request → human approves → gateway decrypts token in memory, calls GitHub REST API, returns `{ html_url, number }`. Secret never returned.

---

## Security rules (MVP)

- Never log secrets.
- Never return secrets or ciphertext to the agent.
- Decrypt only inside the handler, right before the external API call; keep in memory only.
- No env injection into the agent process; no `kv get`–style exposure of plaintext.
