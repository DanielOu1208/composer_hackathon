/**
 * AES-256-GCM encryption with PBKDF2 key derivation.
 * Used only server-side; never expose ciphertext or keys to the agent.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 32;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = "sha256";

function getMasterPassword(): string {
  const pw = process.env.VAULT_MASTER_PASSWORD;
  if (!pw || pw.length < 8) {
    throw new Error("VAULT_MASTER_PASSWORD must be set and at least 8 characters");
  }
  return pw;
}

function deriveKey(salt: Buffer): Buffer {
  const password = getMasterPassword();
  return crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN,
    PBKDF2_DIGEST
  );
}

/**
 * Encrypt a plaintext string. Returns hex-encoded: salt + iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]).toString("hex");
}

/**
 * Decrypt a hex-encoded blob (salt + iv + authTag + ciphertext).
 */
export function decrypt(hexBlob: string): string {
  const buf = Buffer.from(hexBlob, "hex");
  if (
    buf.length < SALT_LEN + IV_LEN + AUTH_TAG_LEN + 1
  ) {
    throw new Error("Invalid ciphertext");
  }
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buf.subarray(
    SALT_LEN + IV_LEN,
    SALT_LEN + IV_LEN + AUTH_TAG_LEN
  );
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
