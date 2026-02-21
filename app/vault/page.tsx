"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function VaultPage() {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadList() {
    const res = await fetch("/api/vault/list");
    const data = await res.json();
    if (data.names) setNames(data.names);
  }

  useEffect(() => {
    loadList();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !value.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/vault/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), value: value.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Saved "${name.trim()}"`);
        setName("");
        setValue("");
        loadList();
      } else {
        setMessage(data.error || "Failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/vault">Vault</Link>
        <Link href="/approvals">Approvals</Link>
        <Link href="/logs">Logs</Link>
      </nav>
      <h1>Vault</h1>
      <p>Add a secret. Only names are listed; values are never shown.</p>
      <form onSubmit={handleAdd}>
        <div className="form-group">
          <label>Name (e.g. GITHUB_TOKEN)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GITHUB_TOKEN"
          />
        </div>
        <div className="form-group">
          <label>Value</label>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="secret value"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Add secret"}
        </button>
      </form>
      {message && <p style={{ marginTop: "1rem" }}>{message}</p>}
      <h2 style={{ marginTop: "2rem" }}>Secret names</h2>
      {names.length === 0 ? (
        <p>No secrets stored.</p>
      ) : (
        <ul>
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
