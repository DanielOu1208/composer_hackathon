import type { ProfilePolicy } from "../profile/profile.js";

/**
 * Block IP literals (IPv4, IPv6), localhost, and private ranges.
 */
function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "127.0.0.1" || lower === "::1") return true;
  // IPv4
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m4 = host.match(ipv4);
  if (m4) {
    const a = parseInt(m4[1], 10);
    const b = parseInt(m4[2], 10);
    const c = parseInt(m4[3], 10);
    const d = parseInt(m4[4], 10);
    if (a >= 0 && a <= 255 && b >= 0 && b <= 255 && c >= 0 && c <= 255 && d >= 0 && d <= 255) {
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 127) return true; // loopback
      return true; // any IP literal blocked per PRD
    }
  }
  // IPv6 (simplified - block if contains :)
  if (host.includes(":")) return true;
  return false;
}

/**
 * Validate host against policy. Default deny; exact hostname match required.
 */
export function validateHost(host: string, policy: ProfilePolicy): boolean {
  if (isBlockedHost(host)) return false;
  return policy.allowedHosts.includes(host);
}

/**
 * Validate HTTP method against policy.
 */
export function validateMethod(method: string, policy: ProfilePolicy): boolean {
  return policy.allowedMethods.map((m) => m.toUpperCase()).includes(method.toUpperCase());
}

/**
 * Validate path against policy.
 */
export function validatePath(path: string, policy: ProfilePolicy): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return policy.allowedPaths.some((p) => {
    const pat = p.startsWith("/") ? p : `/${p}`;
    return normalized === pat || normalized.startsWith(pat + "/");
  });
}

export interface PolicyCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Full policy check for a request.
 */
export function checkPolicy(
  url: URL,
  method: string,
  policy: ProfilePolicy
): PolicyCheckResult {
  if (!validateHost(url.hostname, policy)) {
    return { ok: false, reason: `Host ${url.hostname} not in allowedHosts or is blocked` };
  }
  if (!validateMethod(method, policy)) {
    return { ok: false, reason: `Method ${method} not allowed` };
  }
  if (!validatePath(url.pathname, policy)) {
    return { ok: false, reason: `Path ${url.pathname} not allowed` };
  }
  return { ok: true };
}
