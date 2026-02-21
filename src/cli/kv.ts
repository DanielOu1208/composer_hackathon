import * as readline from "node:readline";
import { putSecret, getSecret, listSecrets, deleteSecret } from "../vault/store.js";
import { appendAudit } from "../audit/log.js";

/**
 * kv put - prompts for secret value, stores encrypted.
 */
export async function kvPut(path: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(q, (ans) => resolve(ans));
    });
  const value = await ask(`Enter value for ${path}: `);
  rl.close();
  if (!value.trim()) {
    console.error("Aborted: empty value");
    process.exit(1);
  }
  await putSecret(path, value.trim());
  appendAudit("cli", "SECRET_CREATED", path, "stored");
  console.error(`Stored secret at ${path}`);
}

/**
 * kv get - internal use only. Returns secret for proxy; does NOT print to stdout.
 */
export async function kvGet(path: string): Promise<string | null> {
  return getSecret(path);
}

/**
 * kv list - lists paths under prefix.
 */
export async function kvList(prefix: string): Promise<void> {
  const paths = await listSecrets(prefix);
  for (const p of paths) {
    console.log(p);
  }
}

/**
 * kv delete - removes secret at path.
 */
export async function kvDelete(path: string): Promise<void> {
  const deleted = await deleteSecret(path);
  if (deleted) {
    appendAudit("cli", "SECRET_DELETED", path, "deleted");
    console.error(`Deleted ${path}`);
  } else {
    console.error(`No secret at ${path}`);
    process.exit(1);
  }
}
