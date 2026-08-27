export type GenLayerNetwork =
  | "localnet"
  | "studionet"
  | "testnetAsimov"
  | "testnetBradbury";

export type NetworkMode = "demo" | "live";

export type AuditPhase =
  | "idle"
  | "preparing"
  | "leader-analysis"
  | "validator-replay"
  | "vote-reveal"
  | "finalized"
  | "failed";

export interface AuditProgress {
  phase: AuditPhase;
  label: string;
  detail: string;
}

export interface ModelDraft {
  name: string;
  architecture: string;
  artifactUrl: string;
  contentHash: string;
}

export interface ModelRecord {
  modelId: number;
  registrant: string;
  modelName: string;
  architectureText: string;
  artifactUrl: string;
  contentHash: string;
  timestamp: number;
  isApproved: boolean;
  auditReason: string;
}

export interface RegistryStats {
  totalRecords: number;
  totalAttempts: number;
  approvedRecords: number;
  rejectedRecords: number;
}

export interface RegistrySnapshot {
  stats: RegistryStats;
  recentRecords: ModelRecord[];
  owner: string | null;
  paused: boolean;
  mode: NetworkMode;
}

export interface WalletConnection {
  address: `0x${string}`;
}

export interface ValidatorVote {
  node: string;
  decision: "APPROVED" | "REJECTED";
  latencyMs: number;
}

export interface SubmissionResult {
  hash: `0x${string}`;
  record: ModelRecord;
  votes: ValidatorVote[];
}

export interface ValidationErrors {
  name?: string;
  architecture?: string;
  artifactUrl?: string;
  contentHash?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrors;
  normalized: ModelDraft;
  nameRemaining: number;
  architectureRemaining: number;
}
