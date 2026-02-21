import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns Buffer: nonce (12) + ciphertext + authTag (16)
 */
export function encrypt(plaintext: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid DEK length");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Decrypt blob (nonce + ciphertext + authTag) with AES-256-GCM.
 */
export function decrypt(blob: Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid DEK length");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Generate a new 32-byte DEK, returned as hex.
 */
export function generateDek(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}
