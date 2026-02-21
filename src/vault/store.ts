import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { getDek, setDek } from "./keychain.js";
import { encrypt, decrypt, generateDek } from "./crypto.js";

const VAULT_DIR = join(homedir(), ".config", "agentvault");
const DB_PATH = join(VAULT_DIR, "vault.db");

let db: Database.Database | null = null;

function ensureVaultDir(): void {
  if (!existsSync(VAULT_DIR)) {
    mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function getDb(): Database.Database {
  if (!db) {
    ensureVaultDir();
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        path TEXT PRIMARY KEY,
        blob BLOB NOT NULL
      );
    `);
  }
  return db;
}

/**
 * Ensure DEK exists; create and store if first run.
 * Returns the DEK as hex.
 */
export async function ensureDek(): Promise<string> {
  let dek = await getDek();
  if (!dek) {
    dek = generateDek();
    await setDek(dek);
  }
  return dek;
}

/**
 * Store a secret at the given path. Encrypts before persisting.
 */
export async function putSecret(path: string, value: string): Promise<void> {
  const dek = await ensureDek();
  const blob = encrypt(value, dek);
  const database = getDb();
  database
    .prepare("INSERT OR REPLACE INTO secrets (path, blob) VALUES (?, ?)")
    .run(path, blob);
}

/**
 * Retrieve and decrypt a secret. Internal use only - never expose to CLI stdout.
 */
export async function getSecret(path: string): Promise<string | null> {
  const dek = await getDek();
  if (!dek) return null;
  const database = getDb();
  const row = database.prepare("SELECT blob FROM secrets WHERE path = ?").get(path) as
    | { blob: Buffer }
    | undefined;
  if (!row) return null;
  return decrypt(row.blob, dek);
}

/**
 * List secret paths under a prefix (e.g. "mcp/").
 */
export async function listSecrets(prefix: string): Promise<string[]> {
  const database = getDb();
  const pattern = prefix.endsWith("/") ? `${prefix}%` : `${prefix}/%`;
  const rows = database
    .prepare("SELECT path FROM secrets WHERE path LIKE ? ORDER BY path")
    .all(pattern) as { path: string }[];
  return rows.map((r) => r.path);
}

/**
 * Delete a secret at the given path.
 */
export async function deleteSecret(path: string): Promise<boolean> {
  const database = getDb();
  const result = database.prepare("DELETE FROM secrets WHERE path = ?").run(path);
  return result.changes > 0;
}
