import type { ModelDraft, ValidationResult } from "@/types/model";

// Client-side mirror of the contract Checks phase. Keep messages byte-identical
// to contracts/ai_model_guard.py so the UI previews exactly what the GenVM
// would revert with.
export const MAX_ATTEMPTS = 3;
export const MAX_MODEL_NAME_LENGTH = 160;
export const MAX_ARCHITECTURE_LENGTH = 4000;
export const MAX_AUDIT_REASON_LENGTH = 400;
export const MAX_CORPUS_MODELS = 64;
export const MIN_ARCHITECTURE_LENGTH = 64;
export const MAX_ARTIFACT_URL_LENGTH = 300;
export const CONTENT_HASH_LENGTH = 64;
export const PROVENANCE_MARKER = "modelguard-provenance:";

/** Exact marker the published artifact must contain for this registrant. */
export function provenanceMarkerFor(address: string): string {
  return `${PROVENANCE_MARKER} ${address.toLowerCase()}`;
}

/** Mirror of _is_supported_artifact_url in the contract. */
export function isSupportedArtifactUrl(value: string): boolean {
  if (!value.startsWith("https://")) {
    return false;
  }
  const remainder = value.slice("https://".length);
  if (!remainder || remainder.includes("@") || remainder.includes("#")) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code > 126) {
      return false;
    }
  }
  return true;
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** sha256 of the exact bytes, computed in the browser via WebCrypto. */
export async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Deterministic identity used for wallet-less demo sessions so lifetime
// attempts stay isolated per identity even before connecting a wallet.
export const GUEST_REGISTRANT =
  "0xa11cea11cea11cea11cea11cea11cea11cea11ce";

export function isAsciiText(value: string, allowLineBreaks: boolean): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint >= 32 && codePoint <= 126) {
      continue;
    }
    if (
      allowLineBreaks &&
      (codePoint === 9 || codePoint === 10 || codePoint === 13)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

export function validateModelDraft(draft: ModelDraft): ValidationResult {
  const normalized: ModelDraft = {
    name: draft.name.trim(),
    architecture: draft.architecture.trim(),
    artifactUrl: draft.artifactUrl.trim(),
    contentHash: draft.contentHash.trim().toLowerCase(),
  };
  const errors: ValidationResult["errors"] = {};

  if (!normalized.name) {
    errors.name = "Model name cannot be empty";
  } else if (normalized.name.length > MAX_MODEL_NAME_LENGTH) {
    errors.name = "Model name exceeds the maximum length";
  } else if (!isAsciiText(normalized.name, false)) {
    errors.name = "Model name must contain only printable ASCII text";
  }

  if (!normalized.architecture) {
    errors.architecture = "Architecture description cannot be empty";
  } else if (normalized.architecture.length < MIN_ARCHITECTURE_LENGTH) {
    errors.architecture = "Architecture description is too short to be audited";
  } else if (normalized.architecture.length > MAX_ARCHITECTURE_LENGTH) {
    errors.architecture = "Architecture description exceeds the maximum length";
  } else if (!isAsciiText(normalized.architecture, true)) {
    errors.architecture = "Architecture description must contain only ASCII text";
  }

  if (!normalized.artifactUrl) {
    errors.artifactUrl = "Artifact URL cannot be empty";
  } else if (normalized.artifactUrl.length > MAX_ARTIFACT_URL_LENGTH) {
    errors.artifactUrl = "Artifact URL exceeds the maximum length";
  } else if (!isSupportedArtifactUrl(normalized.artifactUrl)) {
    errors.artifactUrl = "Artifact URL must be a plain https URL";
  }

  if (!normalized.contentHash) {
    errors.contentHash = "Content hash cannot be empty";
  } else if (!isSha256Hex(normalized.contentHash)) {
    errors.contentHash = "Content hash must be 64 lowercase hex characters";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized,
    nameRemaining: MAX_MODEL_NAME_LENGTH - normalized.name.length,
    architectureRemaining:
      MAX_ARCHITECTURE_LENGTH - normalized.architecture.length,
  };
}

export function normalizeWalletAddress(value: string): `0x${string}` | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }
  return value as `0x${string}`;
}
