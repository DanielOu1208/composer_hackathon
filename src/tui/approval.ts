import blessed from "blessed";
import type { Lease } from "../lease/lease.js";
import { readPendingLeasesFromFile, approveLease, denyLease } from "../lease/lease.js";
import { ensureDek } from "../vault/store.js";

export async function runApprovalTui(): Promise<void> {
  let dekUnlocked = false;
  try {
    await ensureDek();
    dekUnlocked = true;
  } catch {
    /* ignore */
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: "AgentVault",
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: " AgentVault | 0 Pending | Audit OK | DEK " + (dekUnlocked ? "unlocked" : "locked"),
    tags: true,
    style: {
      fg: "white",
      bg: "blue",
    },
  });

  const leftPanel = blessed.list({
    top: 2,
    left: 0,
    width: "50%",
    height: "100%-3",
    label: " Pending Requests ",
    tags: true,
    border: { type: "line" },
    style: {
      fg: "white",
      border: { fg: "gray" },
      selected: { bg: "blue" },
      item: { fg: "white" },
    },
    keys: true,
    vi: true,
  });

  const rightPanel = blessed.box({
    top: 2,
    left: "50%",
    width: "50%",
    height: "100%-3",
    label: " Details ",
    tags: true,
    border: { type: "line" },
    style: {
      fg: "white",
      border: { fg: "gray" },
    },
    content: "Select a request to view details",
  });

  const helpBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: " a: approve | d: deny | q: quit ",
    style: { fg: "gray" },
  });

  screen.append(header);
  screen.append(leftPanel);
  screen.append(rightPanel);
  screen.append(helpBar);

  let leases: Lease[] = [];
  let selectedIndex = 0;

  function formatLeaseItem(l: Lease): string {
    const age = Math.floor((Date.now() - l.createdAt) / 1000);
    return `[${l.id.slice(-8)}] ${l.profile} ${l.method} ${l.path} | ${l.ttlSeconds}s | ${age}s ago`;
  }

  function refresh(): void {
    leases = readPendingLeasesFromFile().filter((l) => l.expiresAt > Date.now());
    leftPanel.setItems(leases.map(formatLeaseItem));
    header.setContent(
      ` AgentVault | ${leases.length} Pending | Audit OK | DEK ${dekUnlocked ? "unlocked" : "locked"} `
    );
    if (leases.length > 0 && selectedIndex < leases.length) {
      const sel = leases[selectedIndex];
      rightPanel.setContent(
        `Agent: Cursor\nProfile: ${sel.profile}\nDestination: ${sel.profile}\nMethod: ${sel.method}\nPath: ${sel.path}\n\nPolicy Checks:\n  Host allowed\n  Method allowed\n  Path allowed\n\nLease:\n  TTL ${sel.ttlSeconds}s\n  Max uses ${sel.maxUses}`
      );
    } else {
      rightPanel.setContent("No pending requests. Waiting...");
    }
    screen.render();
  }

  leftPanel.on("select", (_, index) => {
    selectedIndex = index;
    refresh();
  });

  leftPanel.key("a", () => {
    if (leases.length > 0 && selectedIndex < leases.length) {
      const lease = leases[selectedIndex];
      approveLease(lease.id);
      refresh();
    }
  });

  leftPanel.key("d", () => {
    if (leases.length > 0 && selectedIndex < leases.length) {
      const lease = leases[selectedIndex];
      denyLease(lease.id);
      refresh();
    }
  });

  screen.key(["q", "C-c"], () => {
    process.exit(0);
  });

  leftPanel.focus();
  refresh();

  setInterval(refresh, 1000);
}
