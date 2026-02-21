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
  if (action === "openai_chat") {
    return runOpenAIChat(params);
  }
  if (action === "llm_chat") {
    return runLlmChat(params);
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

/** OpenAI chat: uses OPENAI_KEY or OPENAI_API_KEY from vault only; returns only model text. */
async function runOpenAIChat(
  params: Record<string, unknown>
): Promise<HandlerResult> {
  const prompt = (params.prompt as string) || "";
  if (!prompt.trim()) {
    return { success: false, error: "Missing or empty prompt" };
  }

  const apiKey = vaultGet("OPENAI_KEY") || vaultGet("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      success: false,
      error: "OPENAI_KEY or OPENAI_API_KEY not found in vault",
    };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: (params.model as string) || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      error: (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
    };
  }

  const content =
    (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
  return {
    success: true,
    data: { text: content, model: (data as { model?: string }).model },
  };
}

/** Unified LLM chat: one handler for OpenAI, Anthropic (Claude), Google (Gemini). Keys from vault only; agent never sees them. */
async function runLlmChat(
  params: Record<string, unknown>
): Promise<HandlerResult> {
  const provider = ((params.provider as string) || "").toLowerCase();
  const prompt = (params.prompt as string) || "";
  const model = (params.model as string) || undefined;

  if (!prompt.trim()) {
    return { success: false, error: "Missing or empty prompt" };
  }

  const allowed = ["openai", "anthropic", "google"];
  if (!allowed.includes(provider)) {
    return {
      success: false,
      error: `Invalid provider. Use one of: ${allowed.join(", ")}`,
    };
  }

  if (provider === "openai") {
    const apiKey = vaultGet("OPENAI_KEY") || vaultGet("OPENAI_API_KEY");
    if (!apiKey) {
      return { success: false, error: "OPENAI_KEY or OPENAI_API_KEY not found in vault" };
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
      };
    }
    const text =
      (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
    return {
      success: true,
      data: { text, model: (data as { model?: string }).model, provider: "openai" },
    };
  }

  if (provider === "anthropic") {
    const apiKey = vaultGet("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return { success: false, error: "ANTHROPIC_API_KEY not found in vault" };
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
      };
    }
    const textBlock = (data as { content?: Array<{ type?: string; text?: string }> }).content?.find(
      (c) => c.type === "text"
    );
    const text = textBlock?.text ?? "";
    return {
      success: true,
      data: { text, model: (data as { model?: string }).model, provider: "anthropic" },
    };
  }

  if (provider === "google") {
    const apiKey = vaultGet("GEMINI_API_KEY");
    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY not found in vault" };
    }
    const modelId = model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
      };
    }
    const text =
      (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      success: true,
      data: { text, model: modelId, provider: "google" },
    };
  }

  return { success: false, error: "Unsupported provider" };
}
