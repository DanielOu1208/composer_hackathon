import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "agentvault");
const DB_PATH = join(CONFIG_DIR, "audit.db");

let db: Database.Database | null = null;

export type AuditAction =
  | "SECRET_CREATED"
  | "SECRET_DELETED"
  | "PROFILE_CREATED"
  | "PROFILE_DELETED"
  | "REQUEST_CREATED"
  | "APPROVED"
  | "DENIED"
  | "PROXY_EXECUTED"
  | "BLOCKED_BY_POLICY"
  | "LEASE_EXPIRED";

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: AuditAction;
  resource: string;
  outcome: string;
  prev_hash: string;
  hash: string;
}

function ensureDir(): void {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getDb(): Database.Database {
  if (!db) {
    ensureDir();
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        outcome TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
    `);
  }
  return db;
}

function canonicalJson(obj: Omit<AuditEntry, "hash">): string {
  return JSON.stringify({
    timestamp: obj.timestamp,
    actor: obj.actor,
    action: obj.action,
    resource: obj.resource,
    outcome: obj.outcome,
    prev_hash: obj.prev_hash,
  });
}

function computeHash(prevHash: string, entry: Omit<AuditEntry, "hash">): string {
  const data = prevHash + canonicalJson(entry);
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Append an audit entry. Returns the new hash.
 */
export function appendAudit(
  actor: string,
  action: AuditAction,
  resource: string,
  outcome: string
): string {
  const database = getDb();
  const last = database
    .prepare("SELECT hash FROM audit ORDER BY id DESC LIMIT 1")
    .get() as { hash: string } | undefined;
  const prevHash = last?.hash ?? "0";

  const timestamp = new Date().toISOString();
  const entry: Omit<AuditEntry, "hash"> = {
    timestamp,
    actor,
    action,
    resource,
    outcome,
    prev_hash: prevHash,
  };
  const hash = computeHash(prevHash, entry);

  database
    .prepare(
      "INSERT INTO audit (timestamp, actor, action, resource, outcome, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      entry.timestamp,
      entry.actor,
      entry.action,
      entry.resource,
      entry.outcome,
      entry.prev_hash,
      hash
    );

  return hash;
}

/**
 * Verify the hash chain. Returns true if valid.
 */
export function verifyAuditChain(): { valid: boolean; error?: string } {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT timestamp, actor, action, resource, outcome, prev_hash, hash FROM audit ORDER BY id"
    )
    .all() as Array<Omit<AuditEntry, "hash"> & { hash: string }>;

  let prevHash = "0";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prev_hash !== prevHash) {
      return {
        valid: false,
        error: `Entry ${i + 1}: prev_hash mismatch (expected ${prevHash}, got ${row.prev_hash})`,
      };
    }
    const expectedHash = computeHash(prevHash, row);
    if (row.hash !== expectedHash) {
      return {
        valid: false,
        error: `Entry ${i + 1}: hash mismatch (chain broken)`,
      };
    }
    prevHash = row.hash;
  }
  return { valid: true };
}
