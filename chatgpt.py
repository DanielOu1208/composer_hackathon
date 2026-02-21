#!/usr/bin/env python3
"""
Use ChatGPT via the AgentVault gateway. The API key is stored in the vault
(not in .env or in this file). This script never sees the key; it only sends
a prompt to the gateway and receives the model's reply after you approve.
"""

import time
import urllib.request
import urllib.error
import json

GATEWAY = "http://localhost:3000"


def post_request(prompt: str) -> dict:
    """Ask the gateway to run openai_chat. Returns { requestId, status, ... }."""
    body = json.dumps({"action": "openai_chat", "params": {"prompt": prompt}}).encode("utf-8")
    req = urllib.request.Request(
        f"{GATEWAY}/api/request",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))


def get_requests() -> dict:
    """Get all requests (to find our request and its result)."""
    req = urllib.request.Request(f"{GATEWAY}/api/requests", method="GET")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))


def chat(prompt: str, poll_interval: float = 2.0) -> str:
    """
    Send a prompt through the gateway. You must approve at
    http://localhost:3000/approvals. Returns the model's reply (or raises on error).
    """
    out = post_request(prompt)
    if not out.get("ok"):
        raise RuntimeError(out.get("error", "Request failed"))

    request_id = out["requestId"]
    print(f"Request {request_id} created. Approve at: {GATEWAY}/approvals")
    print("Waiting for approval...")

    while True:
        data = get_requests()
        requests = data.get("requests") or []
        for r in requests:
            if r.get("id") != request_id:
                continue
            status = r.get("status")
            if status == "approved":
                result = r.get("result")
                if isinstance(result, dict) and "text" in result:
                    return result["text"]
                return str(result)
            if status == "denied":
                err = r.get("error") or "Request was denied"
                raise RuntimeError(err)
        time.sleep(poll_interval)


if __name__ == "__main__":
    import sys
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Say hello in one sentence."
    try:
        reply = chat(prompt)
        print("Reply:", reply)
    except Exception as e:
        print("Error:", e)
        sys.exit(1)
