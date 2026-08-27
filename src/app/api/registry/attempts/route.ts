import { NextResponse } from "next/server";

import {
  getRemainingAttempts,
  getAttempts,
} from "@/lib/registry-service";
import { MAX_ATTEMPTS } from "@/lib/validation";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirror of: get_submission_attempts + get_remaining_attempts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "A valid 0x registrant address is required" },
        { status: 400 },
      );
    }
    const [used, remaining] = await Promise.all([
      getAttempts(address),
      getRemainingAttempts(address),
    ]);
    return NextResponse.json({
      used_attempts: used,
      remaining_attempts: remaining,
      max_attempts: MAX_ATTEMPTS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
