import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname, userInfo } from "node:os";

const DEK_DIR = join(homedir(), ".config", "agentvault");
const DEK_PATH = join(DEK_DIR, "dek.enc");
const SALT = "agentvault-dek-salt";
const ITERATIONS = 100_000;
const KEY_LEN = 32;

function deriveKey(): Buffer {
  const seed = hostname() + userInfo().username;
  return pbkdf2Sync(seed, SALT, ITERATIONS, KEY_LEN, "sha512");
}

function ensureDir(): void {
  mkdirSync(DEK_DIR, { recursive: true });
}

/**
 * Store the Data Encryption Key (DEK) encrypted on disk.
 */
export async function setDek(dekHex: string): Promise<void> {
  ensureDir();
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(dekHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = JSON.stringify({
    iv: iv.toString("hex"),
    ciphertext: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  });
  writeFileSync(DEK_PATH, payload, "utf8");
}

/**
 * Retrieve the DEK from the encrypted file.
 * Returns null if not found.
 */
export async function getDek(): Promise<string | null> {
  if (!existsSync(DEK_PATH)) return null;
  try {
    const raw = readFileSync(DEK_PATH, "utf8");
    const { iv, ciphertext, tag } = JSON.parse(raw);
    const key = deriveKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Delete the encrypted DEK file.
 */
export async function deleteDek(): Promise<boolean> {
  if (!existsSync(DEK_PATH)) return false;
  unlinkSync(DEK_PATH);
  return true;
}
