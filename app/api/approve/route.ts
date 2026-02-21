import { NextRequest, NextResponse } from "next/server";
import {
  getRequest,
  updateRequest,
  appendLog,
} from "@/lib/store";
import { executeHandler } from "@/lib/handlers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestId = body.requestId as string | undefined;
    const approved = body.approved === true;
    if (!requestId) {
      return NextResponse.json(
        { error: "Missing requestId" },
        { status: 400 }
      );
    }
    const req = getRequest(requestId);
    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (req.status !== "pending") {
      return NextResponse.json(
        { error: `Request already ${req.status}` },
        { status: 400 }
      );
    }
    if (!approved) {
      updateRequest(requestId, "denied", undefined, "Denied by human");
      appendLog({
        type: "request_denied",
        requestId,
        action: req.action,
        message: `Request ${requestId} denied`,
      });
      return NextResponse.json({
        ok: true,
        requestId,
        status: "denied",
        result: null,
        message: "Request denied.",
      });
    }
    const handlerResult = await executeHandler(req.action, req.params);
    if (handlerResult.success) {
      updateRequest(requestId, "approved", handlerResult.data);
      appendLog({
        type: "request_approved",
        requestId,
        action: req.action,
        message: `Request ${requestId} executed successfully`,
        meta: { resultKeys: Object.keys((handlerResult.data as object) || {}) },
      });
      return NextResponse.json({
        ok: true,
        requestId,
        status: "approved",
        result: handlerResult.data,
        message: "Action executed.",
      });
    } else {
      updateRequest(requestId, "denied", undefined, handlerResult.error);
      appendLog({
        type: "request_failed",
        requestId,
        action: req.action,
        message: `Request ${requestId} failed: ${handlerResult.error}`,
      });
      return NextResponse.json({
        ok: false,
        requestId,
        status: "denied",
        result: null,
        error: handlerResult.error,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Approve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
