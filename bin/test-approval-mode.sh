#!/usr/bin/env bash
# Test AgentVault proxy with approval mode.
# Sends an MCP initialize request, then approves it via the CLI.

set -e
cd "$(dirname "$0")/.."

INIT_MSG='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"approval-test","version":"1.0.0"}}}'
OUTPUT_FILE=$(mktemp)
STDERR_FILE=$(mktemp)
PENDING_FILE="$HOME/.config/agentvault/pending.json"

cleanup() {
  rm -f "$OUTPUT_FILE" "$STDERR_FILE"
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting proxy with --approval-mode cli..."
(printf '%s\n' "$INIT_MSG"; sleep 20) | npx tsx src/index.ts proxy --profile context7 --approval-mode cli > "$OUTPUT_FILE" 2> "$STDERR_FILE" &
PROXY_PID=$!

echo "Waiting for proxy to receive request..."
sleep 3

if [[ ! -f "$PENDING_FILE" ]]; then
  echo "ERROR: No pending lease found at $PENDING_FILE"
  cat "$STDERR_FILE"
  exit 1
fi

LEASE_ID=$(node -e "
  const fs=require('fs');
  const p=JSON.parse(fs.readFileSync('$PENDING_FILE','utf8'));
  console.log((Array.isArray(p)?p[0]:p)?.id||'');
")
if [[ -z "$LEASE_ID" ]]; then
  echo "ERROR: Could not parse lease ID from $PENDING_FILE"
  cat "$PENDING_FILE"
  exit 1
fi

echo "Pending request: $LEASE_ID"
echo "Approving..."
npx tsx src/index.ts approve "$LEASE_ID"

echo "Waiting for proxy to complete..."
sleep 3

echo ""
echo "=== Proxy stderr (approval prompt) ==="
cat "$STDERR_FILE"
echo ""
echo "=== Proxy stdout (Context7 response) ==="
cat "$OUTPUT_FILE"

if grep -q '"result"' "$OUTPUT_FILE"; then
  echo ""
  echo "SUCCESS: Context7 responded. Approval mode test passed."
else
  echo ""
  echo "WARNING: No result in output. Check above for errors."
  exit 1
fi
