import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "100", 10) || 100,
      500
    );
    const logs = getLogs(limit);
    return NextResponse.json({ logs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Logs failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
