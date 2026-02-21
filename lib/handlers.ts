/**
 * Action handlers. Decrypt secrets only here, right before external API call.
 * Never log or return secret values.
 */

import { vaultGet } from "./vault";

export type HandlerResult = { success: true; data: unknown } | { success: false; error: string };

export async function executeHandler(
  action: string,
  params: Record<string, unknown>
): Promise<HandlerResult> {
  if (action === "hello_world") {
    return runHelloWorld(params);
  }
  if (action === "github_create_issue") {
    return runGitHubCreateIssue(params);
  }
  return { success: false, error: `Unknown action: ${action}` };
}

/** Demo action: no secret needed. Use this to test the full flow without a GitHub token. */
async function runHelloWorld(
  params: Record<string, unknown>
): Promise<HandlerResult> {
  const message = (params.message as string) || "World";
  return {
    success: true,
    data: {
      message: `Hello, ${message}!`,
      echoed: params,
      note: "Gateway executed this; no vault secret was used.",
    },
  };
}

async function runGitHubCreateIssue(
  params: Record<string, unknown>
): Promise<HandlerResult> {
  const owner = params.owner as string | undefined;
  const repo = params.repo as string | undefined;
  const title = params.title as string | undefined;
  const body = params.body as string | undefined;

  if (!owner || !repo || !title) {
    return {
      success: false,
      error: "Missing required params: owner, repo, title",
    };
  }

  // Decrypt only here, use only in memory for the request
  let token: string | null = vaultGet("GITHUB_TOKEN");
  if (!token && process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
  }
  if (!token) {
    return {
      success: false,
      error: "GITHUB_TOKEN not found in vault or env",
    };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body: body || "" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      error: data.message || `HTTP ${res.status}`,
    };
  }
  return {
    success: true,
    data: { html_url: data.html_url, number: data.number },
  };
}
