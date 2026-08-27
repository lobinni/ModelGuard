import type { ValidatorVote } from "@/types/model";

// ---------------------------------------------------------------------------
// Deterministic localnet audit engine.
//
// On GenLayer the originality verdict comes from gl.nondet.exec_prompt — an
// LLM "Chief Judge" whose decision must be reproduced by every validator. The
// mirror cannot ship an LLM inside the request path, so it replaces the prompt
// with a deterministic semantic judge over the SAME evidence the contract
// would build: the sampled sliding window of the 64 most recent approved
// records (see MAX_CORPUS_MODELS in validation.ts and _build_approved_corpus
// in contracts/ai_model_guard.py).
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "using", "use",
  "uses", "used", "via", "over", "under", "each", "per", "all", "any", "its",
  "are", "was", "were", "will", "would", "can", "could", "should", "may",
  "might", "not", "our", "their", "they", "them", "then", "than", "when",
  "where", "which", "while", "about", "between", "through", "across", "based",
  "model", "models", "system", "systems", "method", "methods", "data",
]);

export interface CorpusEntry {
  modelId: number;
  modelName: string;
  architectureText: string;
}

export interface JudgeVerdict {
  decision: "APPROVED" | "REJECTED";
  reason: string;
  score: number;
  collidingModelId: number | null;
}

export interface AuditOutcome {
  verdict: JudgeVerdict;
  votes: ValidatorVote[];
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return matches.filter(
    (token) => token.length > 2 && !STOP_WORDS.has(token),
  );
}

function bigrams(tokens: string[]): string[] {
  const grams: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    grams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return grams;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function containment(left: Set<string>, right: Set<string>): number {
  const smallest = Math.min(left.size, right.size);
  if (smallest === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  return intersection / smallest;
}

function semanticScore(
  candidate: { name: string; architecture: string },
  entry: CorpusEntry,
): number {
  const nameScore = jaccard(
    new Set(tokenize(candidate.name)),
    new Set(tokenize(entry.modelName)),
  );
  const candidateTokens = new Set(tokenize(candidate.architecture));
  const entryTokens = new Set(tokenize(entry.architectureText));
  const tokenScore = jaccard(candidateTokens, entryTokens);

  const candidateGrams = new Set(bigrams(tokenize(candidate.architecture)));
  const entryGrams = new Set(bigrams(tokenize(entry.architectureText)));
  const gramScore = Math.max(
    jaccard(candidateGrams, entryGrams),
    containment(candidateGrams, entryGrams) * 0.9,
  );

  // The phrase-level bigram evidence dominates, mirroring the contract rule
  // that paraphrased protected logic (not shared vocabulary) is plagiarism.
  return 0.25 * nameScore + 0.3 * tokenScore + 0.45 * gramScore;
}

function clampReason(reason: string): string {
  return reason.length <= 400 ? reason : `${reason.slice(0, 397)}...`;
}

// Gate one of the Chief Judge prompt (substance). A registration must contain
// enough specific technical content — a concrete topology, training pipeline,
// optimizer schedule, or orchestration design — to be distinguishable as a
// protectable design. Vague claims and buzzword-only text are rejected here,
// before originality is even considered, exactly like the on-chain prompt.
function isSubstantive(text: string): boolean {
  if (text.length < 64) {
    return false;
  }
  const tokens = tokenize(text);
  const unique = new Set(tokens);
  // Fewer than 10 distinct meaningful terms cannot describe a technical design.
  return tokens.length >= 15 && unique.size >= 10;
}

// Gate one of the Chief Judge prompt (faithfulness). The description must
// actually correspond to the authenticated artifact; otherwise the registrant
// is anchoring a real source while claiming something else entirely.
function isFaithful(description: string, artifactExcerpt: string): boolean {
  const claimed = new Set(tokenize(description));
  const evidence = new Set(tokenize(artifactExcerpt));
  if (claimed.size === 0 || evidence.size === 0) {
    return false;
  }
  let shared = 0;
  for (const token of claimed) {
    if (evidence.has(token)) {
      shared += 1;
    }
  }
  return shared / claimed.size >= 0.25;
}

// The Chief Judge pass: apply faithfulness and substance gates, then compare
// the candidate against every approved record in the sampled window — the
// same three-gate response contract the on-chain prompt demands.
export function runChiefJudge(
  candidate: { name: string; architecture: string; artifactExcerpt: string },
  corpus: CorpusEntry[],
): JudgeVerdict {
  // Gate 1 — faithfulness against the authenticated artifact.
  if (!isFaithful(candidate.architecture, candidate.artifactExcerpt)) {
    return {
      decision: "REJECTED",
      reason:
        "The submitted description does not match the authenticated source artifact: the claimed design is not the design published at the verified URL.",
      score: 0,
      collidingModelId: null,
    };
  }

  // Gate 2 — substance, judged on the authenticated artifact itself.
  if (!isSubstantive(candidate.artifactExcerpt)) {
    return {
      decision: "REJECTED",
      reason:
        "The authenticated artifact is a vague claim without concrete technical substance: it does not describe a distinguishable model architecture, training pipeline, optimizer schedule, or multi-agent orchestration design.",
      score: 0,
      collidingModelId: null,
    };
  }

  if (corpus.length === 0) {
    return {
      decision: "APPROVED",
      reason:
        "The sampled approved window is empty, so no protected architecture can collide with the candidate.",
      score: 0,
      collidingModelId: null,
    };
  }

  let bestScore = 0;
  let bestEntry: CorpusEntry | null = null;
  for (const entry of corpus) {
    const score = semanticScore(candidate, entry);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  const percent = Math.round(bestScore * 100);
  if (bestEntry && bestScore >= 0.55) {
    return {
      decision: "REJECTED",
      reason: clampReason(
        `The candidate reproduces substantial protected core logic of approved model #${bestEntry.modelId} "${bestEntry.modelName}" (semantic overlap ${percent}%). Paraphrase-level similarity exceeds the originality threshold.`,
      ),
      score: bestScore,
      collidingModelId: bestEntry.modelId,
    };
  }

  return {
    decision: "APPROVED",
    reason: clampReason(
      `No approved model in the sampled window reproduces the candidate topology, training pipeline, or orchestration logic (max semantic overlap ${percent}%). Independently expressed design.`,
    ),
    score: bestScore,
    collidingModelId: null,
  };
}

// Validators rerun the same bounded audit and must agree on the substantive
// decision (MAJORITY_AGREE). The judge is deterministic, so the panel agrees;
// per-node latency jitter keeps the replay telemetry realistic.
export function runValidatorPanel(
  seed: string,
  verdict: JudgeVerdict,
): ValidatorVote[] {
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) {
    state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: 5 }, (_, index) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return {
      node: `validator-0${index + 1}`,
      decision: verdict.decision,
      latencyMs: 180 + (state % 740),
    };
  });
}

export function executeAudit(
  candidate: { name: string; architecture: string; artifactExcerpt: string },
  corpus: CorpusEntry[],
): AuditOutcome {
  const verdict = runChiefJudge(candidate, corpus);
  const votes = runValidatorPanel(
    `${candidate.name}::${candidate.architecture.length}`,
    verdict,
  );
  return { verdict, votes };
}
