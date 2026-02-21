"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Req = {
  id: string;
  action: string;
  params: Record<string, unknown>;
  status: string;
  createdAt: number;
  decidedAt?: number;
  result?: unknown;
  error?: string;
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/requests");
    const data = await res.json();
    if (data.requests) setRequests(data.requests);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(requestId: string, approved: boolean) {
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, approved }),
    });
    const data = await res.json();
    if (res.ok) {
      load();
    } else {
      alert(data.error || "Failed");
    }
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="container">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/vault">Vault</Link>
        <Link href="/approvals">Approvals</Link>
        <Link href="/logs">Logs</Link>
      </nav>
      <h1>Approvals</h1>
      <p>Approve or deny pending agent requests. Only approved actions run with vault secrets.</p>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <h2>Pending ({pending.length})</h2>
          {pending.length === 0 ? (
            <p>No pending requests.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Params</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.id}</code></td>
                    <td>{r.action}</td>
                    <td><pre className="pre" style={{ margin: 0, fontSize: "0.85rem" }}>{JSON.stringify(r.params)}</pre></td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <button className="success" onClick={() => approve(r.id, true)}>Approve</button>
                      {" "}
                      <button className="danger" onClick={() => approve(r.id, false)}>Deny</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ marginTop: "2rem" }}>All requests</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Action</th>
                <th>Status</th>
                <th>Created</th>
                <th>Result / Error</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.id}</code></td>
                  <td>{r.action}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    {r.result != null && <code>{JSON.stringify(r.result)}</code>}
                    {r.error && <span style={{ color: "#f87171" }}>{r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
