import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "agentvault");
const APPROVALS_DIR = join(CONFIG_DIR, "approvals");
const PENDING_FILE = join(CONFIG_DIR, "pending.json");

export interface Lease {
  id: string;
  profile: string;
  method: string;
  path: string;
  ttlSeconds: number;
  maxUses: number;
  createdAt: number;
  expiresAt: number;
  uses: number;
}

const pendingLeases = new Map<string, Lease>();
const pendingResolvers = new Map<
  string,
  { resolve: (approved: boolean) => void; timeout: NodeJS.Timeout }
>();

function generateId(): string {
  return `lease_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureApprovalsDir(): void {
  if (!existsSync(APPROVALS_DIR)) {
    mkdirSync(APPROVALS_DIR, { recursive: true });
  }
}

/**
 * Create a lease request and block until approved or denied.
 */
export function createLeaseRequest(
  profile: string,
  method: string,
  path: string,
  opts: { ttlSeconds?: number; maxUses?: number } = {}
): Promise<boolean> {
  const ttl = opts.ttlSeconds ?? 60;
  const maxUses = opts.maxUses ?? 1;
  const now = Date.now();
  const expiresAt = now + ttl * 1000;

  const lease: Lease = {
    id: generateId(),
    profile,
    method,
    path,
    ttlSeconds: ttl,
    maxUses,
    createdAt: now,
    expiresAt,
    uses: 0,
  };

  pendingLeases.set(lease.id, lease);

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      const res = pendingResolvers.get(lease.id);
      if (res) {
        pendingResolvers.delete(lease.id);
        pendingLeases.delete(lease.id);
        resolve(false); // expired = deny
      }
    }, ttl * 1000);

    pendingResolvers.set(lease.id, {
      resolve: (approved) => {
        clearTimeout(timeout);
        pendingResolvers.delete(lease.id);
        pendingLeases.delete(lease.id);
        resolve(approved);
      },
      timeout,
    });

    emitLeaseRequest(lease);

    // Persist for TUI to read
    writePendingFile();

    // Poll for file-based approval (when approve/deny runs in another process)
    const pollForFile = () => {
      const path = join(APPROVALS_DIR, `${lease.id}.approved`);
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, "utf8").trim();
          unlinkSync(path);
          const res = pendingResolvers.get(lease.id);
          if (res) {
            clearTimeout(res.timeout);
            pendingResolvers.delete(lease.id);
            pendingLeases.delete(lease.id);
            res.resolve(content === "approved");
            writePendingFile();
          }
        } catch {
          /* ignore */
        }
        return;
      }
      setTimeout(pollForFile, 100);
    };
    pollForFile();
  });
}

/**
 * Approve a pending lease (called from approve command).
 */
export function approveLease(leaseId: string): boolean {
  const res = pendingResolvers.get(leaseId);
  if (res) {
    res.resolve(true);
    return true;
  }
  ensureApprovalsDir();
  writeFileSync(join(APPROVALS_DIR, `${leaseId}.approved`), "approved");
  return true;
}

/**
 * Deny a pending lease.
 */
export function denyLease(leaseId: string): boolean {
  const res = pendingResolvers.get(leaseId);
  if (res) {
    res.resolve(false);
    return true;
  }
  ensureApprovalsDir();
  writeFileSync(join(APPROVALS_DIR, `${leaseId}.approved`), "denied");
  return true;
}

/**
 * Get all pending leases.
 */
export function getPendingLeases(): Lease[] {
  const now = Date.now();
  return Array.from(pendingLeases.values()).filter((l) => l.expiresAt > now);
}

let onLeaseRequest: ((lease: Lease) => void) | null = null;

export function setLeaseRequestHandler(handler: (lease: Lease) => void): void {
  onLeaseRequest = handler;
}

function emitLeaseRequest(lease: Lease): void {
  onLeaseRequest?.(lease);
}

function writePendingFile(): void {
  const dir = dirname(PENDING_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pending = getPendingLeases();
  writeFileSync(
    PENDING_FILE,
    JSON.stringify(pending.map((l) => ({ ...l })), null, 2)
  );
}

/**
 * Read pending leases from file (for TUI in another process).
 */
export function readPendingLeasesFromFile(): Lease[] {
  if (!existsSync(PENDING_FILE)) return [];
  try {
    const raw = readFileSync(PENDING_FILE, "utf8");
    return JSON.parse(raw) as Lease[];
  } catch {
    return [];
  }
}
