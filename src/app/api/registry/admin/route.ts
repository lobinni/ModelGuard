import { NextResponse } from "next/server";

import { RegistryError, setPaused } from "@/lib/registry-service";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirror of: set_paused(bool) — owner-only emergency control.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      paused?: unknown;
      caller?: unknown;
    } | null;

    if (
      !body ||
      body.action !== "set_paused" ||
      typeof body.paused !== "boolean" ||
      typeof body.caller !== "string"
    ) {
      return NextResponse.json(
        { error: 'Expected { action: "set_paused", paused: boolean, caller: "0x..." }' },
        { status: 400 },
      );
    }

    const result = await setPaused(body.caller, body.paused);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof RegistryError ? 403 : 500;
    return NextResponse.json(
      { error: errorMessage(error) },
      { status },
    );
  }
}
