/**
 * Vault storage: encrypted JSON file on disk.
 * Structure: { [name: string]: string } where value is hex ciphertext.
 * Never return ciphertext or decrypted values to the agent.
 */

import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "./crypto";

const VAULT_FILENAME = "vault.enc.json";

function vaultPath(): string {
  return path.join(process.cwd(), VAULT_FILENAME);
}

type VaultData = Record<string, string>;

function readRaw(): VaultData {
  try {
    const raw = fs.readFileSync(vaultPath(), "utf8");
    return JSON.parse(raw) as VaultData;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

function writeRaw(data: VaultData): void {
  fs.writeFileSync(vaultPath(), JSON.stringify(data, null, 0), "utf8");
}

/** Store a secret by name. Overwrites if exists. */
export function vaultSet(name: string, plaintext: string): void {
  const data = readRaw();
  data[name] = encrypt(plaintext);
  writeRaw(data);
}

/** Get decrypted secret by name. Use only server-side, right before API call. */
export function vaultGet(name: string): string | null {
  const data = readRaw();
  const ciphertext = data[name];
  if (!ciphertext) return null;
  return decrypt(ciphertext);
}

/** List secret names only (no values, no ciphertext). */
export function vaultListNames(): string[] {
  const data = readRaw();
  return Object.keys(data);
}
