import type { Profile } from "../profile/profile.js";
import { getSecret } from "../vault/store.js";
import { checkPolicy } from "./policy.js";
import { createLeaseRequest, setLeaseRequestHandler } from "../lease/lease.js";
import { appendAudit } from "../audit/log.js";

/**
 * Forward a JSON-RPC message to the remote MCP server with auth header injection.
 * Enforces policy and response size limit.
 * When requireApproval is true, blocks until user approves via CLI.
 */
export async function forwardMessage(
  message: unknown,
  profile: Profile,
  profileName: string,
  serializeResponse: (msg: unknown) => string,
  requireApproval = false
): Promise<string> {
  const url = new URL(profile.remoteUrl);
  const method = (message as { method?: string }).method ?? "unknown";

  if (requireApproval) {
    appendAudit("proxy", "REQUEST_CREATED", profile.remoteUrl, method);
    const approved = await createLeaseRequest(
      profileName,
      "POST",
      url.pathname,
      { ttlSeconds: 60, maxUses: 1 }
    );
    if (!approved) {
      appendAudit("user", "DENIED", profile.remoteUrl, "Lease denied or expired");
      const errorResponse = createJsonRpcError(
        message,
        -32603,
        "Request denied or lease expired"
      );
      return serializeResponse(errorResponse);
    }
    appendAudit("user", "APPROVED", profile.remoteUrl, "Lease approved");
  }

  const policyCheck = checkPolicy(url, "POST", profile.policy);
  if (!policyCheck.ok) {
    const errorResponse = createJsonRpcError(
      message,
      -32603,
      `Policy violation: ${policyCheck.reason}`
    );
    return serializeResponse(errorResponse);
  }

  const secret = await getSecret(profile.auth.secretPath);
  if (!secret) {
    const errorResponse = createJsonRpcError(
      message,
      -32603,
      `Secret not found at ${profile.auth.secretPath}`
    );
    return serializeResponse(errorResponse);
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    [profile.auth.name]: secret,
  });

  const body = JSON.stringify(message);

  const controller = new AbortController();
  const response = await fetch(profile.remoteUrl, {
    method: "POST",
    headers,
    body,
    redirect: profile.policy.allowRedirects ? "follow" : "manual",
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorResponse = createJsonRpcError(
      message,
      -32603,
      `Remote server error: ${response.status} ${response.statusText}`
    );
    return serializeResponse(errorResponse);
  }

  if (!profile.policy.allowRedirects && response.redirected) {
    const finalUrl = new URL(response.url);
    const redirectCheck = checkPolicy(finalUrl, "POST", profile.policy);
    if (!redirectCheck.ok) {
      const errorResponse = createJsonRpcError(
        message,
        -32603,
        `Redirect to ${response.url} blocked by policy`
      );
      return serializeResponse(errorResponse);
    }
  }

  const responseBody = await response.text();
  if (responseBody.length > profile.policy.maxResponseBytes) {
    appendAudit("proxy", "BLOCKED_BY_POLICY", profile.remoteUrl, "Response too large");
    const errorResponse = createJsonRpcError(
      message,
      -32603,
      `Response exceeds maxResponseBytes (${profile.policy.maxResponseBytes})`
    );
    return serializeResponse(errorResponse);
  }

  appendAudit("proxy", "PROXY_EXECUTED", profile.remoteUrl, method);
  return responseBody.trim() ? responseBody + "\n" : "";
}

function createJsonRpcError(
  message: unknown,
  code: number,
  errorMsg: string
): Record<string, unknown> {
  const msg = message as { id?: string | number };
  return {
    jsonrpc: "2.0",
    id: msg?.id ?? null,
    error: { code, message: errorMsg },
  };
}
