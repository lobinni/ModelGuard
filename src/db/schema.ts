import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Off-chain localnet mirror of the AIModelGuard intelligent contract storage.
// Column names intentionally match the on-chain ModelRecord fields so the API
// serializes exactly like `genlayer-js` read results.
// ---------------------------------------------------------------------------

// DynArray[ModelRecord] analog: append-only audit trail (approved + rejected).
export const modelRecords = pgTable("model_records", {
  id: serial("id").primaryKey(),
  registrant: varchar("registrant", { length: 64 }).notNull(),
  modelName: varchar("model_name", { length: 160 }).notNull(),
  architectureText: text("architecture_text").notNull(),
  // Provenance anchor: the public source artifact and the sha256 digest of
  // its exact bytes, both verified during the audit.
  artifactUrl: varchar("artifact_url", { length: 300 }).notNull().default(""),
  contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
  timestamp: integer("timestamp").notNull(),
  isApproved: boolean("is_approved").notNull(),
  auditReason: varchar("audit_reason", { length: 400 }).notNull(),
});

// TreeMap[Address, u256] analog: lifetime attempts per registrant address.
export const submissionAttempts = pgTable("submission_attempts", {
  registrant: varchar("registrant", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
});

// Singleton administrative state (owner + emergency pause).
export const registryMeta = pgTable("registry_meta", {
  id: integer("id").primaryKey(),
  owner: varchar("owner", { length: 64 }).notNull(),
  paused: boolean("paused").notNull().default(false),
});

export type ModelRecordRow = typeof modelRecords.$inferSelect;
export type NewModelRecordRow = typeof modelRecords.$inferInsert;
export type RegistryMetaRow = typeof registryMeta.$inferSelect;
