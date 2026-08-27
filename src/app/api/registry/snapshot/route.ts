import { NextResponse } from "next/server";

import {
  getRegistrySnapshot,
  getRemainingAttempts,
} from "@/lib/registry-service";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirror of: get_registry_stats + get_model_record scan + get_owner +
// is_registration_paused (+ get_remaining_attempts when an address is given).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const snapshot = await getRegistrySnapshot();
    const remainingAttempts = address
      ? await getRemainingAttempts(address)
      : null;
    return NextResponse.json({ ...snapshot, remainingAttempts });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
