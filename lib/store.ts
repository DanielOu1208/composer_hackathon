/**
 * In-memory stores for pending requests and audit logs (MVP).
 */

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

const requests = new Map<string, ActionRequest>();
const logs: AuditLogEntry[] = [];

let requestCounter = 0;
let logCounter = 0;

export function createRequest(
  action: string,
  params: Record<string, unknown>
): ActionRequest {
  const id = `req_${Date.now()}_${++requestCounter}`;
  const req: ActionRequest = {
    id,
    action,
    params,
    status: "pending",
    createdAt: Date.now(),
  };
  requests.set(id, req);
  return req;
}

export function getRequest(id: string): ActionRequest | undefined {
  return requests.get(id);
}

export function listPendingRequests(): ActionRequest[] {
  return Array.from(requests.values()).filter((r) => r.status === "pending");
}

export function listAllRequests(): ActionRequest[] {
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
  const req = requests.get(id);
  if (!req) return undefined;
  req.status = status;
  req.decidedAt = Date.now();
  if (result !== undefined) req.result = result;
  if (error !== undefined) req.error = error;
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
