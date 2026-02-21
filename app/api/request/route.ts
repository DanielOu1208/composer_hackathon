import { NextRequest, NextResponse } from "next/server";
import { createRequest, appendLog } from "@/lib/store";

const ALLOWED_ACTIONS = ["hello_world", "github_create_issue", "openai_chat", "llm_chat"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string | undefined;
    const params = (body.params as Record<string, unknown>) || {};
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    const req = createRequest(action, params);
    appendLog({
      type: "request_created",
      requestId: req.id,
      action,
      message: `Request created: ${req.id}`,
      meta: { action, paramKeys: Object.keys(params) },
    });
    return NextResponse.json({
      ok: true,
      requestId: req.id,
      status: "pending",
      message: "Request created. Awaiting human approval.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
