import { NextResponse } from "next/server";

import { RegistryError, getModelRecord } from "@/lib/registry-service";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirror of: get_model_record(model_id)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const modelId = Number.parseInt(id, 10);
    if (!Number.isInteger(modelId) || modelId < 0) {
      return NextResponse.json(
        { error: "Model record does not exist" },
        { status: 404 },
      );
    }
    const record = await getModelRecord(modelId);
    return NextResponse.json({ record });
  } catch (error) {
    const status = error instanceof RegistryError ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage(error) },
      { status },
    );
  }
}
