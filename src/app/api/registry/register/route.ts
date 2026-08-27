import { NextResponse } from "next/server";

import {
  RegistryError,
  registerAndAuditModel,
} from "@/lib/registry-service";
import { GUEST_REGISTRANT, MAX_ATTEMPTS } from "@/lib/validation";
import { errorMessage } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mirror of: register_and_audit_model(
//   model_name, architecture_text, artifact_url, content_hash
// ) -> u256
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      architecture?: unknown;
      artifactUrl?: unknown;
      contentHash?: unknown;
      registrant?: unknown;
    } | null;

    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.architecture !== "string" ||
      typeof body.artifactUrl !== "string" ||
      typeof body.contentHash !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Request body must include string fields: name, architecture, artifactUrl, contentHash",
        },
        { status: 400 },
      );
    }

    // Demo sessions without a connected wallet share a deterministic guest
    // registrant address so lifetime attempts are still isolated per identity.
    const registrant =
      typeof body.registrant === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(body.registrant)
        ? body.registrant
        : GUEST_REGISTRANT;
    const effectiveRegistrant = registrant;

    const result = await registerAndAuditModel(
      {
        name: body.name,
        architecture: body.architecture,
        artifactUrl: body.artifactUrl,
        contentHash: body.contentHash,
      },
      effectiveRegistrant,
    );

    return NextResponse.json({
      hash: result.hash,
      record: result.record,
      votes: result.votes,
      model_id: result.record.modelId,
      max_attempts: MAX_ATTEMPTS,
    });
  } catch (error) {
    const status = error instanceof RegistryError ? 400 : 500;
    return NextResponse.json(
      { error: errorMessage(error) },
      { status },
    );
  }
}
