import { NextRequest, NextResponse } from "next/server";
import { vaultSet } from "@/lib/vault";
import { appendLog } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = body.name as string | undefined;
    const value = body.value as string | undefined;
    if (!name || typeof value !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid name/value" },
        { status: 400 }
      );
    }
    vaultSet(name, value);
    appendLog({ type: "vault_set", message: `Secret stored: ${name}` });
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vault set failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
