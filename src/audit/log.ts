import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "agentvault");
const AUDIT_PATH = join(CONFIG_DIR, "audit.json");

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

interface AuditFile {
  entries: AuditEntry[];
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadAuditFile(): AuditFile {
  ensureDir();
  if (!existsSync(AUDIT_PATH)) {
    return { entries: [] };
  }
  const raw = readFileSync(AUDIT_PATH, "utf-8");
  return JSON.parse(raw) as AuditFile;
}

function saveAuditFile(data: AuditFile): void {
  ensureDir();
  writeFileSync(AUDIT_PATH, JSON.stringify(data, null, 2), "utf-8");
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
  const auditFile = loadAuditFile();
  const entries = auditFile.entries;
  const prevHash = entries.length > 0 ? entries[entries.length - 1].hash : "0";

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

  entries.push({ ...entry, hash });
  saveAuditFile(auditFile);

  return hash;
}

/**
 * Verify the hash chain. Returns true if valid.
 */
export function verifyAuditChain(): { valid: boolean; error?: string } {
  const auditFile = loadAuditFile();
  const entries = auditFile.entries;

  let prevHash = "0";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.prev_hash !== prevHash) {
      return {
        valid: false,
        error: `Entry ${i + 1}: prev_hash mismatch (expected ${prevHash}, got ${entry.prev_hash})`,
      };
    }
    const expectedHash = computeHash(prevHash, entry);
    if (entry.hash !== expectedHash) {
      return {
        valid: false,
        error: `Entry ${i + 1}: hash mismatch (chain broken)`,
      };
    }
    prevHash = entry.hash;
  }
  return { valid: true };
}
