import { NextResponse } from "next/server";
import { vaultListNames } from "@/lib/vault";

export async function GET() {
  try {
    const names = vaultListNames();
    return NextResponse.json({ names });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vault list failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
