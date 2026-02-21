/**
 * Requests persisted to file so all workers see the same state. Logs in-memory (MVP).
 */

import fs from "fs";
import path from "path";

export type RequestStatus = "pending" | "approved" | "denied";

export interface ActionRequest {
  id: string;
  action: string;
  params: Record<string, unknown>;
  status: RequestStatus;
  createdAt: number;
  decidedAt?: number;
  result?: unknown;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: string;
  requestId?: string;
  action?: string;
  message: string;
  meta?: Record<string, unknown>;
}

const REQUESTS_FILE = path.join(process.cwd(), "requests.json");

function readRequests(): Map<string, ActionRequest> {
  try {
    const raw = fs.readFileSync(REQUESTS_FILE, "utf8");
    const data = JSON.parse(raw) as {
      requests: ActionRequest[];
      requestCounter: number;
    };
    const map = new Map<string, ActionRequest>();
    (data.requests || []).forEach((r) => {
      if (r && typeof r.id === "string") map.set(String(r.id).trim(), r);
    });
    return map;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw e;
  }
}

function getRequestCounter(): number {
  try {
    const raw = fs.readFileSync(REQUESTS_FILE, "utf8");
    const data = JSON.parse(raw) as { requestCounter?: number };
    return data.requestCounter ?? 0;
  } catch {
    return 0;
  }
}

function writeRequests(requests: Map<string, ActionRequest>, requestCounter: number): void {
  const requestsArray = Array.from(requests.values());
  fs.writeFileSync(
    REQUESTS_FILE,
    JSON.stringify({ requests: requestsArray, requestCounter }, null, 0),
    "utf8"
  );
}

const logs: AuditLogEntry[] = [];
let logCounter = 0;

export function createRequest(
  action: string,
  params: Record<string, unknown>
): ActionRequest {
  const requests = readRequests();
  const requestCounter = getRequestCounter() + 1;
  const id = `req_${Date.now()}_${requestCounter}`;
  const req: ActionRequest = {
    id,
    action,
    params,
    status: "pending",
    createdAt: Date.now(),
  };
  requests.set(id, req);
  writeRequests(requests, requestCounter);
  return req;
}

export function getRequest(id: string): ActionRequest | undefined {
  if (!id || typeof id !== "string") return undefined;
  const requests = readRequests();
  return requests.get(id.trim()) ?? requests.get(id);
}

export function listPendingRequests(): ActionRequest[] {
  const requests = readRequests();
  return Array.from(requests.values()).filter((r) => r.status === "pending");
}

export function listAllRequests(): ActionRequest[] {
  const requests = readRequests();
  return Array.from(requests.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

export function updateRequest(
  id: string,
  status: "approved" | "denied",
  result?: unknown,
  error?: string
): ActionRequest | undefined {
  const requests = readRequests();
  const req = requests.get(id);
  if (!req) return undefined;
  req.status = status;
  req.decidedAt = Date.now();
  if (result !== undefined) req.result = result;
  if (error !== undefined) req.error = error;
  requests.set(id, req);
  writeRequests(requests, getRequestCounter());
  return req;
}

export function appendLog(entry: Omit<AuditLogEntry, "id" | "timestamp">): void {
  logs.push({
    id: `log_${++logCounter}`,
    timestamp: Date.now(),
    ...entry,
  });
}

export function getLogs(limit = 100): AuditLogEntry[] {
  return [...logs].reverse().slice(0, limit);
}
