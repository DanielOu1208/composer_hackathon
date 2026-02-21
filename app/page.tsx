import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/vault">Vault</Link>
        <Link href="/approvals">Approvals</Link>
        <Link href="/logs">Logs</Link>
      </nav>
      <h1>AgentVault</h1>
      <p>
        Local permissioned execution gateway for Cursor. The agent requests actions;
        secrets stay in the vault. You approve or deny each request. The agent never sees plaintext secrets.
      </p>
      <ul>
        <li>
          <Link href="/vault">Vault</Link> — Add secrets (e.g. GITHUB_TOKEN), list names only
        </li>
        <li>
          <Link href="/approvals">Approvals</Link> — Pending requests: approve or deny
        </li>
        <li>
          <Link href="/logs">Logs</Link> — Audit events
        </li>
      </ul>
    </div>
  );
}
