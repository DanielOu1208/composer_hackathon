# AgentVault — Conversion Plan (TeamVault → Local Permissioned Gateway)

**Goal:** Convert [TeamVault](https://github.com/wanot-ai/teamvault) into a **local, permissioned execution gateway** for Cursor. No env injection, no plaintext secrets to the agent, no Postgres, no full RBAC. Demo-ready in ~4 hours.

---

## Refactored Architecture

- **Agent (Cursor)** requests an action by name + params via `POST /api/request`. It never receives secrets, ciphertext, or any "kv get"–style value.
- **Gateway (this app)** is Next.js only: API routes + React UI. No Go backend, no Postgres. Single process.
- **Vault** is one local file `vault.enc.json`. Secrets are encrypted at rest with **AES-256-GCM**; key derived from **VAULT_MASTER_PASSWORD** (env) via PBKDF2.
- **Human approval** is required. Requests are stored as "pending"; only after a human approves via UI (or `POST /api/approve`) does the gateway execute the action.
- **Execution** happens inside the gateway: handler decrypts the required secret (e.g. `GITHUB_TOKEN`) **in memory only**, calls the external API (e.g. GitHub REST), returns **only the result** (e.g. issue URL). Secret is never logged or returned.
- **No injection model:** We do **not** inject secrets into the agent process. We do **not** use env vars for the agent. The agent never sees `kv get` or any plaintext secret.
- **API surface for agent:** `POST /api/request` (create), `GET /api/requests` (list status). Optionally `POST /api/approve` if you automate approval. No vault get/list that returns values.
- **UI-only vault:** Add secret and list secret **names** only via Next.js pages; vault set/list API is for the UI, not for exposing values to the agent.
- **Audit:** In-memory logs; `GET /api/logs` returns events only (no secret values).
- **Single handler for MVP:** `github_create_issue` — gateway calls GitHub REST to create an issue using `GITHUB_TOKEN` from the vault.

---

## Folder Structure (AgentVault)

```
agentvault/   (or repo root)
├── app/
│   ├── api/
│   │   ├── vault/
│   │   │   ├── set/route.ts      # POST – store encrypted secret (UI only)
│   │   │   └── list/route.ts     # GET – names only (UI only)
│   │   ├── request/route.ts      # POST – create pending action
│   │   ├── requests/route.ts     # GET – list all requests
│   │   ├── approve/route.ts      # POST – approve/deny + execute handler
│   │   └── logs/route.ts        # GET – audit logs
│   ├── vault/page.tsx            # Add secret, list names
│   ├── approvals/page.tsx        # Pending approvals, approve/deny
│   ├── logs/page.tsx             # Audit log view
│   ├── page.tsx                  # Home
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── crypto.ts                 # AES-256-GCM + PBKDF2
│   ├── vault.ts                  # vault.enc.json read/write (no get exposed to agent)
│   ├── store.ts                  # in-memory requests + logs
│   └── handlers.ts               # github_create_issue
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
├── .gitignore
└── README.md
```

---

## If Starting From TeamVault Repo: Files to DELETE

Remove everything that implements env injection, Go backend, Postgres, and plaintext secret exposure:

- **Entire Go backend:** `bin/`, `cmd/`, `internal/`, `go.mod`, `go.sum`, `Makefile`, `Dockerfile`, `docker-compose.yml`
- **CLI that exposes secrets:** `teamvault kv get` must not exist — remove or replace CLI: any `bin/`, `cmd/` that do kv get
- **Injectors / run hooks:** `extension/`, any `*-env-hook*`, `teamvault run` style injection
- **Integrations that inject into agent process:** e.g. `integrations/openclaw/` if it only does env injection
- **DB / migrations:** `migrations/`, any Postgres or DB config
- **K8s / Terraform / production infra:** `kubernetes/`, `terraform/` (optional for MVP)
- **Tests that depend on Go/DB:** `tests/` if they test the old model
- **Docs that describe injection:** Update or remove sections in `README.md` that describe `teamvault kv get`, `teamvault run`, env injection

Keep (or repurpose):

- `README.md` — replace with AgentVault readme
- `web/` — only if you want to reuse; otherwise replace with this Next.js `app/` + `lib/`

---

## Files to CREATE (AgentVault)

| Path | Purpose |
|------|--------|
| `package.json` | Next.js app, no Go |
| `tsconfig.json` | TypeScript |
| `next.config.js` | Next config |
| `.env.example` | `VAULT_MASTER_PASSWORD` (required) |
| `.gitignore` | `node_modules`, `.next`, `.env`, `vault.enc.json` |
| `app/layout.tsx` | Root layout |
| `app/page.tsx` | Home + nav |
| `app/globals.css` | Minimal styles |
| `app/vault/page.tsx` | Add secret, list names only |
| `app/approvals/page.tsx` | Pending list, approve/deny |
| `app/logs/page.tsx` | Audit log |
| `app/api/vault/set/route.ts` | POST body `{ name, value }` → encrypt, write vault |
| `app/api/vault/list/route.ts` | GET → `{ names: string[] }` |
| `app/api/request/route.ts` | POST body `{ action, params }` → create pending request |
| `app/api/requests/route.ts` | GET → list requests |
| `app/api/approve/route.ts` | POST body `{ requestId, approved }` → execute if approved |
| `app/api/logs/route.ts` | GET → audit events |
| `lib/crypto.ts` | AES-256-GCM + PBKDF2, encrypt/decrypt |
| `lib/vault.ts` | read/write `vault.enc.json`, vaultGet only for handlers |
| `lib/store.ts` | In-memory requests Map + logs array |
| `lib/handlers.ts` | `github_create_issue`: vaultGet("GITHUB_TOKEN"), call GitHub API, return result |
| `README.md` | Architecture, run instructions, no injection |

---

## Encryption Helper (AES-256-GCM + PBKDF2)

- **Algorithm:** AES-256-GCM (IV + auth tag per secret).
- **Key derivation:** PBKDF2 from `VAULT_MASTER_PASSWORD` (env), random salt per secret, 100k iterations, SHA-256, 32-byte key.
- **Stored format:** Hex-encoded `salt || iv || authTag || ciphertext`. Decrypt only in handlers; never send to client or log.

See `lib/crypto.ts` in this repo for the exact implementation.

---

## API Route Examples

- **POST /api/request**  
  Body: `{ "action": "github_create_issue", "params": { "owner": "octocat", "repo": "Hello-World", "title": "Test", "body": "" } }`  
  Response: `{ "ok": true, "requestId": "req_...", "status": "pending", "message": "Awaiting human approval." }`

- **GET /api/requests**  
  Response: `{ "requests": [ { "id", "action", "params", "status", "createdAt", "result?", "error?" } ] }`

- **POST /api/approve**  
  Body: `{ "requestId": "req_...", "approved": true }`  
  Response: `{ "ok": true, "requestId", "status": "approved", "result": { "html_url": "...", "number": 123 } }` (no secret)

- **GET /api/logs**  
  Response: `{ "logs": [ { "id", "timestamp", "type", "message", "requestId?" } ] }`

---

## Minimal React UI

- **Vault:** Form (name + value) → POST /api/vault/set; list from GET /api/vault/list (names only).
- **Approvals:** GET /api/requests, filter pending; buttons Approve/Deny → POST /api/approve.
- **Logs:** GET /api/logs, table of events.

No production features; minimal styling for demo.

---

## Run Locally on Windows (Step-by-Step)

1. **Prerequisites:** Node.js 18+ and npm (or use the same as this repo).
2. **Clone or open repo** (this repo is already AgentVault-style).
3. **Install:**  
   `npm install`
4. **Set master password:**  
   `set VAULT_MASTER_PASSWORD=your-secure-master-password`
5. **Optional (dev):** Store GitHub token in vault via UI, or set env:  
   `set GITHUB_TOKEN=ghp_xxxx`
6. **Start dev server:**  
   `npm run dev`
7. **Open:**  
   http://localhost:3000
8. **Vault:** Add a secret with name `GITHUB_TOKEN` and your token.
9. **Agent (e.g. curl):**  
   `curl -X POST http://localhost:3000/api/request -H "Content-Type: application/json" -d "{\"action\":\"github_create_issue\",\"params\":{\"owner\":\"YOUR_USER\",\"repo\":\"YOUR_REPO\",\"title\":\"Test issue\"}}" `
10. **Approvals:** Open Approvals page, approve the request; gateway will create the issue and show the result (e.g. issue URL). Secret never returned.

---

## Summary

| TeamVault (remove) | AgentVault (this) |
|-------------------|-------------------|
| Env injection, `teamvault run` | No injection; agent never gets secrets |
| `kv get` plaintext | No get for agent; list names only in UI |
| Go backend + Postgres | Next.js API routes only, in-memory store |
| Full RBAC/org/teams | No RBAC for MVP; single user, local |
| CLI + web | Next.js UI only (vault, approvals, logs) |

This repo already implements AgentVault. Use it as the reference; when converting from the [TeamVault repo](https://github.com/wanot-ai/teamvault), delete the files listed above and add the files in the table.
