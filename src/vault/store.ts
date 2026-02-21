import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDek, setDek } from "./keychain.js";
import { encrypt, decrypt, generateDek } from "./crypto.js";

const VAULT_DIR = join(homedir(), ".config", "agentvault");
const VAULT_PATH = join(VAULT_DIR, "vault.json");

interface VaultData {
  secrets: Record<string, string>;
}

function ensureVaultDir(): void {
  if (!existsSync(VAULT_DIR)) {
    mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function loadVault(): VaultData {
  ensureVaultDir();
  if (!existsSync(VAULT_PATH)) {
    return { secrets: {} };
  }
  const raw = readFileSync(VAULT_PATH, "utf-8");
  return JSON.parse(raw) as VaultData;
}

function saveVault(data: VaultData): void {
  ensureVaultDir();
  writeFileSync(VAULT_PATH, JSON.stringify(data, null, 2), "utf-8");
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
  const vault = loadVault();
  vault.secrets[path] = blob.toString("hex");
  saveVault(vault);
}

/**
 * Retrieve and decrypt a secret. Internal use only - never expose to CLI stdout.
 */
export async function getSecret(path: string): Promise<string | null> {
  const dek = await getDek();
  if (!dek) return null;
  const vault = loadVault();
  const hex = vault.secrets[path];
  if (!hex) return null;
  return decrypt(Buffer.from(hex, "hex"), dek);
}

/**
 * List secret paths under a prefix (e.g. "mcp/").
 */
export async function listSecrets(prefix: string): Promise<string[]> {
  const vault = loadVault();
  if (!prefix) {
    return Object.keys(vault.secrets).sort();
  }
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return Object.keys(vault.secrets)
    .filter((key) => key.startsWith(normalizedPrefix))
    .sort();
}

/**
 * Delete a secret at the given path.
 */
export async function deleteSecret(path: string): Promise<boolean> {
  const vault = loadVault();
  if (!(path in vault.secrets)) return false;
  delete vault.secrets[path];
  saveVault(vault);
  return true;
}
