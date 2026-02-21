"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LogEntry = {
  id: string;
  timestamp: number;
  type: string;
  requestId?: string;
  action?: string;
  message: string;
  meta?: Record<string, unknown>;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/logs?limit=100")
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
        setLoading(false);
      });
  }, []);

  return (
    <div className="container">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/vault">Vault</Link>
        <Link href="/approvals">Approvals</Link>
        <Link href="/logs">Logs</Link>
      </nav>
      <h1>Audit logs</h1>
      <p>Events only; secrets are never logged.</p>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Request</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.timestamp).toLocaleString()}</td>
                <td><code>{l.type}</code></td>
                <td>{l.requestId ? <code>{l.requestId}</code> : "—"}</td>
                <td>{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
