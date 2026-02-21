import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const keytar = require("keytar") as {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

const SERVICE = "com.agentvault.local";
const ACCOUNT = "dek";

/**
 * Store the Data Encryption Key (DEK) in macOS Keychain.
 * Called on first run when no DEK exists.
 */
export async function setDek(dekHex: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCOUNT, dekHex);
}

/**
 * Retrieve the DEK from macOS Keychain.
 * Returns null if not found (first run).
 */
export async function getDek(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ACCOUNT);
}

/**
 * Delete the DEK from Keychain (e.g. for reset/uninstall).
 */
export async function deleteDek(): Promise<boolean> {
  return keytar.deletePassword(SERVICE, ACCOUNT);
}
