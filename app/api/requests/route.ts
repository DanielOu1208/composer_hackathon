import { NextResponse } from "next/server";
import { listAllRequests } from "@/lib/store";

export async function GET() {
  try {
    const requests = listAllRequests();
    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        action: r.action,
        params: r.params,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        result: r.result,
        error: r.error,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
