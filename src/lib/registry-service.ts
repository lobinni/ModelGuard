import "server-only";

import { createHash } from "node:crypto";

import { count, desc, eq, sql, sum } from "drizzle-orm";

import { db } from "@/db";
import { modelRecords, registryMeta, submissionAttempts } from "@/db/schema";
import {
  executeAudit,
  type CorpusEntry,
} from "@/lib/audit-engine";
import {
  MAX_ATTEMPTS,
  MAX_CORPUS_MODELS,
  PROVENANCE_MARKER,
  validateModelDraft,
} from "@/lib/validation";
import type {
  ModelDraft,
  ModelRecord,
  RegistrySnapshot,
  RegistryStats,
  SubmissionResult,
} from "@/types/model";

// ---------------------------------------------------------------------------
// PostgreSQL localnet mirror of the AIModelGuard intelligent contract.
//
// Every function below re-implements the corresponding contract method with
// the same Checks -> Effects -> Interaction ordering, the same revert
// messages, and the same return shapes (snake_case JSON, like genlayer-js).
// It exists so the frontend can drive the complete consensus UX in demo mode;
// live mode bypasses this module and talks to Studionet directly.
// ---------------------------------------------------------------------------

const META_ID = 1;
const DEMO_OWNER = "0x50695B75CaBe031CD4cfaD1F16dA338b658D3b48";
const RECENT_RECORD_LIMIT = 5;

export class RegistryError extends Error {}

interface ModelRow {
  id: number;
  registrant: string;
  modelName: string;
  architectureText: string;
  artifactUrl: string;
  contentHash: string;
  timestamp: number;
  isApproved: boolean;
  auditReason: string;
}

function toModelRecord(row: ModelRow): ModelRecord {
  return {
    modelId: row.id,
    registrant: row.registrant,
    modelName: row.modelName,
    architectureText: row.architectureText,
    artifactUrl: row.artifactUrl,
    contentHash: row.contentHash,
    timestamp: row.timestamp,
    isApproved: row.isApproved,
    auditReason: row.auditReason,
  };
}

const MAX_ARTIFACT_BYTES = 24_000;
const MAX_ARTIFACT_EXCERPT = 6_000;

function sanitizeArtifactText(raw: string): string {
  const kept: string[] = [];
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      kept.push(character);
    } else if (code === 9 || code === 10 || code === 13) {
      kept.push(" ");
    }
    if (kept.length >= MAX_ARTIFACT_EXCERPT) {
      break;
    }
  }
  return kept.join("").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Mirror of `fetch_verified_artifact` in the contract: fetch the committed
 * URL, prove the bytes hash to the committed digest, and prove the artifact
 * carries the registrant provenance marker. Any failure aborts the
 * registration exactly like the on-chain revert.
 */
async function fetchVerifiedArtifact(
  artifactUrl: string,
  contentHash: string,
  registrant: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(artifactUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "text/plain, text/*, application/json;q=0.9, */*;q=0.5" },
    });
  } catch {
    throw new RegistryError("[PROVENANCE_ERROR] Artifact URL is not reachable");
  }
  if (!response.ok) {
    throw new RegistryError("[PROVENANCE_ERROR] Artifact URL is not reachable");
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new RegistryError("[PROVENANCE_ERROR] Artifact is empty");
  }
  if (buffer.byteLength > MAX_ARTIFACT_BYTES) {
    throw new RegistryError("[PROVENANCE_ERROR] Artifact exceeds the size limit");
  }

  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== contentHash) {
    throw new RegistryError(
      "[PROVENANCE_ERROR] Artifact digest does not match the committed hash",
    );
  }

  const decoded = new TextDecoder("utf-8").decode(buffer);
  const flattened = decoded.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  const address = registrant.toLowerCase();
  if (
    !flattened.includes(`${PROVENANCE_MARKER}${address}`) &&
    !flattened.includes(`${PROVENANCE_MARKER} ${address}`)
  ) {
    throw new RegistryError(
      "[PROVENANCE_ERROR] Artifact does not carry the registrant provenance marker",
    );
  }

  const excerpt = sanitizeArtifactText(decoded);
  if (!excerpt) {
    throw new RegistryError("[PROVENANCE_ERROR] Artifact has no readable text");
  }
  return excerpt;
}

// Snake_case serialization identical to the on-chain ModelRecord calldata.
export function toChainRecord(row: ModelRow) {
  return {
    registrant: row.registrant,
    model_name: row.modelName,
    architecture_text: row.architectureText,
    artifact_url: row.artifactUrl,
    content_hash: row.contentHash,
    timestamp: row.timestamp,
    is_approved: row.isApproved,
    audit_reason: row.auditReason,
  };
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function ensureSeeded(): Promise<void> {
  const existing = await db
    .select({ id: registryMeta.id })
    .from(registryMeta)
    .where(eq(registryMeta.id, META_ID))
    .limit(1);
  if (existing.length > 0) {
    return;
  }

  const now = nowUnix();
  await db.transaction(async (tx) => {
    await tx
      .insert(registryMeta)
      .values({ id: META_ID, owner: DEMO_OWNER, paused: false })
      .onConflictDoNothing();

    const seeded = await tx
      .select({ id: modelRecords.id })
      .from(modelRecords)
      .limit(1);
    if (seeded.length > 0) {
      return;
    }

    const demoRows = [
      {
        registrant: "0x8A31d2c94A1b5E37F90c2d1B48a6C03e77c912AB",
        modelName: "Mixture-of-Depths Router Stack",
        architectureText:
          "A depth-adaptive transformer that routes tokens through variable compute depth using entropy-gated early exits and a learned halting policy.",
        artifactUrl: "https://example.org/specs/mixture-of-depths.md",
        contentHash: "a".repeat(64),
        timestamp: now - 25_200,
        isApproved: true,
        auditReason:
          "The routing topology and halting policy are independently expressed with no protected match in the sampled window.",
      },
      {
        registrant: "0x1D80f3b2A94cD6E71B5a09C4f8e2B7d3A60e7F11",
        modelName: "Contrastive Retrieval Pretrain Loop",
        architectureText:
          "A pretraining loop that alternates contrastive retrieval alignment with masked reconstruction over a frozen document index.",
        artifactUrl: "https://example.org/specs/contrastive-retrieval.md",
        contentHash: "b".repeat(64),
        timestamp: now - 14_400,
        isApproved: false,
        auditReason:
          'The candidate reproduces substantial protected core logic of approved model #1 "Mixture-of-Depths Router Stack" (semantic overlap 71%). Paraphrase-level similarity exceeds the originality threshold.',
      },
      {
        registrant: "0xB9201cAA58fE4d92C6b17D05a3F829c4e131CA33",
        modelName: "Validator-Anchored Distillation Vault",
        architectureText:
          "A distillation pipeline that checkpoints teacher logits against validator-signed delivery criteria before student weights are released.",
        artifactUrl: "https://example.org/specs/distillation-vault.md",
        contentHash: "c".repeat(64),
        timestamp: now - 7_200,
        isApproved: true,
        auditReason:
          "No approved model in the sampled window reproduces the candidate settlement and distillation sequence.",
      },
    ];

    await tx.insert(modelRecords).values(demoRows);
    for (const row of demoRows) {
      await tx
        .insert(submissionAttempts)
        .values({ registrant: row.registrant, attempts: 1 })
        .onConflictDoNothing();
    }
  });
}

export async function getRegistryStats(): Promise<RegistryStats> {
  await ensureSeeded();
  const [stats] = await db
    .select({
      totalRecords: count(modelRecords.id),
      approvedRecords: sql<number>`coalesce(sum(case when ${modelRecords.isApproved} then 1 else 0 end), 0)`,
      rejectedRecords: sql<number>`coalesce(sum(case when ${modelRecords.isApproved} then 0 else 1 end), 0)`,
    })
    .from(modelRecords);
  const [attempts] = await db
    .select({ total: sum(submissionAttempts.attempts) })
    .from(submissionAttempts);

  return {
    totalRecords: Number(stats?.totalRecords ?? 0),
    totalAttempts: Number(attempts?.total ?? 0),
    approvedRecords: Number(stats?.approvedRecords ?? 0),
    rejectedRecords: Number(stats?.rejectedRecords ?? 0),
  };
}

export async function getRegistrySnapshot(): Promise<
  Omit<RegistrySnapshot, "mode">
> {
  await ensureSeeded();
  const [stats, rows, meta] = await Promise.all([
    getRegistryStats(),
    db
      .select()
      .from(modelRecords)
      .orderBy(desc(modelRecords.id))
      .limit(RECENT_RECORD_LIMIT),
    db
      .select()
      .from(registryMeta)
      .where(eq(registryMeta.id, META_ID))
      .limit(1),
  ]);

  return {
    stats,
    recentRecords: rows.map(toModelRecord),
    owner: meta[0]?.owner ?? DEMO_OWNER,
    paused: meta[0]?.paused ?? false,
  };
}

export async function getModelRecord(modelId: number): Promise<ModelRecord> {
  await ensureSeeded();
  const rows = await db
    .select()
    .from(modelRecords)
    .where(eq(modelRecords.id, modelId))
    .limit(1);
  if (rows.length === 0) {
    throw new RegistryError("Model record does not exist");
  }
  return toModelRecord(rows[0]);
}

export async function getAttempts(registrant: string): Promise<number> {
  await ensureSeeded();
  const rows = await db
    .select({ attempts: submissionAttempts.attempts })
    .from(submissionAttempts)
    .where(eq(submissionAttempts.registrant, registrant))
    .limit(1);
  return rows[0]?.attempts ?? 0;
}

export async function getRemainingAttempts(registrant: string): Promise<number> {
  const attempts = await getAttempts(registrant);
  return Math.max(0, MAX_ATTEMPTS - attempts);
}

function toCorpus(rows: ModelRow[]): CorpusEntry[] {
  return rows
    .filter((row) => row.isApproved)
    .slice(0, MAX_CORPUS_MODELS)
    .reverse()
    .map((row) => ({
      modelId: row.id,
      modelName: row.modelName,
      architectureText: row.architectureText,
    }));
}

// register_and_audit_model — Checks / Effects / Interaction, mirrored.
export async function registerAndAuditModel(
  draft: ModelDraft,
  registrant: string,
): Promise<SubmissionResult> {
  await ensureSeeded();

  // --- Checks -------------------------------------------------------------
  const meta = await db
    .select()
    .from(registryMeta)
    .where(eq(registryMeta.id, META_ID))
    .limit(1);
  if (meta[0]?.paused) {
    throw new RegistryError("Model registration is paused");
  }

  const validation = validateModelDraft(draft);
  if (!validation.isValid) {
    throw new RegistryError(
      validation.errors.name ??
        validation.errors.architecture ??
        validation.errors.artifactUrl ??
        validation.errors.contentHash ??
        "Invalid model submission",
    );
  }

  const duplicate = await db
    .select({ id: modelRecords.id })
    .from(modelRecords)
    .where(eq(modelRecords.contentHash, validation.normalized.contentHash))
    .limit(1);
  if (duplicate.length > 0) {
    throw new RegistryError("Artifact content hash is already registered");
  }

  const attempts = await getAttempts(registrant);
  if (attempts >= MAX_ATTEMPTS) {
    throw new RegistryError("Maximum submission attempts reached");
  }

  // Sampled sliding window: newest approved records first, capped at 64.
  const windowRows = await db
    .select()
    .from(modelRecords)
    .where(eq(modelRecords.isApproved, true))
    .orderBy(desc(modelRecords.id))
    .limit(MAX_CORPUS_MODELS);
  const corpus = toCorpus(windowRows);
  const submittedAt = nowUnix();

  // --- Interaction part 1: authenticate the artifact BEFORE charging an
  // attempt, so an unreachable or tampered source is never billed.
  const artifactExcerpt = await fetchVerifiedArtifact(
    validation.normalized.artifactUrl,
    validation.normalized.contentHash,
    registrant,
  );

  // --- Effects (anti-grinding): consume the attempt BEFORE the audit ------
  await db
    .insert(submissionAttempts)
    .values({ registrant, attempts: 1 })
    .onConflictDoUpdate({
      target: submissionAttempts.registrant,
      set: { attempts: attempts + 1 },
    });

  // --- Interaction part 2 (judge over authenticated evidence + replay) ----
  const audit = executeAudit(
    { ...validation.normalized, artifactExcerpt },
    corpus,
  );
  const isApproved = audit.verdict.decision === "APPROVED";

  // --- Effects (persist the audited record) -------------------------------
  const inserted = await db
    .insert(modelRecords)
    .values({
      registrant,
      modelName: validation.normalized.name,
      architectureText: validation.normalized.architecture,
      artifactUrl: validation.normalized.artifactUrl,
      contentHash: validation.normalized.contentHash,
      timestamp: submittedAt,
      isApproved,
      auditReason: audit.verdict.reason,
    })
    .returning();
  const row = inserted[0];

  const hash = `0x${createHash("sha256")
    .update(
      `${row.id}:${registrant}:${validation.normalized.name}:${submittedAt}:${audit.verdict.decision}`,
    )
    .digest("hex")}` as `0x${string}`;

  return {
    hash,
    record: toModelRecord(row),
    votes: audit.votes,
  };
}

// set_paused — owner-only administrative control, mirrored.
export async function setPaused(
  caller: string,
  paused: boolean,
): Promise<{ owner: string; paused: boolean }> {
  await ensureSeeded();
  const meta = await db
    .select()
    .from(registryMeta)
    .where(eq(registryMeta.id, META_ID))
    .limit(1);
  const owner = meta[0]?.owner ?? DEMO_OWNER;
  if (caller.toLowerCase() !== owner.toLowerCase()) {
    throw new RegistryError("Only the owner can perform this action");
  }
  await db
    .update(registryMeta)
    .set({ paused })
    .where(eq(registryMeta.id, META_ID));
  return { owner, paused };
}
