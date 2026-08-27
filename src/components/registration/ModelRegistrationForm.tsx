"use client";

import { useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  FileCode2,
  Loader2,
  Lock,
  PauseOctagon,
  Send,
} from "lucide-react";

import { shortHash } from "@/lib/format";
import {
  provenanceMarkerFor,
  sha256Hex,
  validateModelDraft,
} from "@/lib/validation";
import type { ModelDraft, NetworkMode, SubmissionResult } from "@/types/model";

interface ModelRegistrationFormProps {
  mode: NetworkMode;
  walletAddress: string | null;
  remainingAttempts: number;
  paused: boolean;
  isSubmitting: boolean;
  isConnecting: boolean;
  lastSubmission: SubmissionResult | null;
  onSubmit: (draft: ModelDraft) => Promise<SubmissionResult | null>;
  onConnectWallet: () => void;
}

// Ready-made original architectures for trying the live contract on
// Studionet. Each wallet has exactly three lifetime attempts — one sample
// per attempt. Submitting a reworded copy of an approved record afterwards
// demonstrates the rejection path.
const SAMPLE_DRAFTS: { label: string; name: string; architecture: string }[] = [
  {
    label: "Mixture of experts",
    name: "Entropy-Gated Mixture of Experts",
    architecture:
      "A transformer stack where every block measures token entropy and routes low-uncertainty tokens to a single generalist expert while dispatching high-uncertainty tokens across three specialists. A verifier gate re-encodes any expert output whose confidence margin drops below a learned threshold, and the routing decisions are logged for later replay.",
  },
  {
    label: "Distillation pipeline",
    name: "Curriculum-Stable Diffusion Distiller",
    architecture:
      "A two-stage pipeline that trains a compact student generator against frozen teacher trajectories. Training pairs are ordered by reconstruction difficulty, each curriculum stage freezes only after the student clears a held-out fidelity floor, and checkpoint weights are released solely against validator-signed delivery receipts.",
  },
  {
    label: "Agent orchestration",
    name: "Swarm Consensus Scribe Network",
    architecture:
      "A five-agent orchestration where a planner decomposes the task, two researcher agents gather evidence with disjoint tool permissions, a critic replays every claim against source snapshots, and the scribe may publish an artifact only after a quorum of agents has signed the same evidence ledger.",
  },
];

function AttemptDots({ remaining }: { remaining: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${remaining} attempts remaining`}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-1.5 w-5 rounded-full transition ${
            index < remaining
              ? "bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
              : "bg-slate-700"
          }`}
        />
      ))}
    </span>
  );
}

export function ModelRegistrationForm({
  mode,
  walletAddress,
  remainingAttempts,
  paused,
  isSubmitting,
  isConnecting,
  lastSubmission,
  onSubmit,
  onConnectWallet,
}: ModelRegistrationFormProps) {
  const [name, setName] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorNote, setAnchorNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const validation = useMemo(
    () => validateModelDraft({ name, architecture, artifactUrl, contentHash }),
    [name, architecture, artifactUrl, contentHash],
  );

  const marker = provenanceMarkerFor(walletAddress ?? "0xYOUR_WALLET_ADDRESS");

  // Fetch the published artifact and compute the sha256 the contract will
  // independently re-verify on every validator.
  const anchorArtifact = async () => {
    const url = artifactUrl.trim();
    if (!url) {
      setAnchorNote("Paste the public https URL of your source artifact first.");
      return;
    }
    setIsAnchoring(true);
    setAnchorNote(null);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`The artifact URL returned ${response.status}.`);
      }
      const buffer = await response.arrayBuffer();
      const digest = await sha256Hex(buffer);
      setContentHash(digest);
      const text = new TextDecoder().decode(buffer).toLowerCase();
      const hasMarker = text.includes(marker.split(" ")[0]);
      setAnchorNote(
        hasMarker
          ? "Artifact hashed. The provenance marker was found in the file."
          : "Artifact hashed, but the provenance marker is missing — add the line below to the file and hash again.",
      );
    } catch (error) {
      setAnchorNote(
        error instanceof Error
          ? `Could not read the artifact: ${error.message}`
          : "Could not read the artifact.",
      );
    } finally {
      setIsAnchoring(false);
    }
  };

  const attemptsExhausted = remainingAttempts <= 0;
  const needsWallet = mode === "live" && !walletAddress;
  const blocked =
    paused ||
    attemptsExhausted ||
    isSubmitting ||
    needsWallet ||
    !validation.isValid;

  const handleSubmit = async () => {
    setTouched(true);
    if (!validation.isValid || paused || attemptsExhausted) {
      return;
    }
    await onSubmit(validation.normalized);
  };

  const showErrors = touched;

  return (
    <section
      aria-label="Register a model architecture"
      className="glass-card flex flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-sky-200/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <FileCode2 size={15} className="text-cyan-300" />
          <h2 className="panel-title">Register architecture</h2>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
            attempts
          </span>
          <AttemptDots remaining={remainingAttempts} />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {paused ? (
          <p className="flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-200">
            <PauseOctagon size={13} />
            Registration is paused by the owner
          </p>
        ) : null}

        <div>
          <p className="metric-label mb-2">Start from a sample to test the live contract</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_DRAFTS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                disabled={isSubmitting || paused}
                onClick={() => {
                  setName(sample.name);
                  setArchitecture(sample.architecture);
                  setTouched(false);
                  setAnchorNote(
                    "Sample loaded. Publish it at a public https URL with the provenance line, then press Hash artifact.",
                  );
                }}
                className="rounded-lg border border-sky-200/15 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between">
            <span className="metric-label">Model name</span>
            <span
              className={`font-mono text-[10px] tabular-nums ${
                validation.nameRemaining < 0 ? "text-rose-300" : "text-slate-500"
              }`}
            >
              {160 - name.trim().length}/160
            </span>
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Give your model a short name"
            maxLength={200}
            spellCheck={false}
            className="field-input"
          />
          {showErrors && validation.errors.name ? (
            <span className="field-error">{validation.errors.name}</span>
          ) : null}
        </label>

        <label className="block flex-1">
          <span className="mb-1.5 flex items-center justify-between">
            <span className="metric-label">Architecture specification</span>
            <span
              className={`font-mono text-[10px] tabular-nums ${
                validation.architectureRemaining < 0 ||
                (architecture.trim().length > 0 &&
                  architecture.trim().length < 64)
                  ? "text-amber-300"
                  : "text-slate-500"
              }`}
            >
              {architecture.trim().length > 0 && architecture.trim().length < 64
                ? "minimum 64 characters"
                : `${4000 - architecture.trim().length}/4000`}
            </span>
          </span>
          <textarea
            value={architecture}
            onChange={(event) => setArchitecture(event.target.value)}
            placeholder={
              "Describe what makes the design yours: the topology, the training pipeline, the optimizer schedule, or the agent orchestration."
            }
            rows={7}
            spellCheck={false}
            className="field-input min-h-40 resize-y text-xs leading-relaxed"
          />
          {showErrors && validation.errors.architecture ? (
            <span className="field-error">{validation.errors.architecture}</span>
          ) : null}
        </label>

        <div className="rounded-xl border border-sky-200/10 bg-[#060d1c] p-3.5">
          <p className="metric-label">Provenance anchor</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Publish your design at a public https URL and include this line in
            the file so the network can prove you control the source:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[10px] text-cyan-200">
            {marker}
          </code>

          <label className="mt-3 block">
            <span className="metric-label">Artifact URL</span>
            <input
              value={artifactUrl}
              onChange={(event) => setArtifactUrl(event.target.value)}
              placeholder="https://raw.githubusercontent.com/you/repo/main/spec.md"
              spellCheck={false}
              className="field-input mt-1.5 text-xs"
            />
            {showErrors && validation.errors.artifactUrl ? (
              <span className="field-error">{validation.errors.artifactUrl}</span>
            ) : null}
          </label>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void anchorArtifact()}
              disabled={isAnchoring || isSubmitting}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 transition hover:border-cyan-300/60 disabled:opacity-50"
            >
              {isAnchoring ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileCode2 size={12} />
              )}
              Hash artifact
            </button>
            <input
              value={contentHash}
              onChange={(event) => setContentHash(event.target.value.trim().toLowerCase())}
              placeholder="sha256 digest (64 hex characters)"
              spellCheck={false}
              className="field-input h-8 flex-1 py-0 font-mono text-[10px]"
            />
          </div>
          {showErrors && validation.errors.contentHash ? (
            <span className="field-error">{validation.errors.contentHash}</span>
          ) : null}
          {anchorNote ? (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-amber-200/90">
              {anchorNote}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-sky-200/10 bg-[#060d1c] px-3 py-2.5">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <Lock size={11} />
            {mode === "live"
              ? walletAddress
                ? "signed by your connected wallet"
                : "connect MetaMask on Studionet to submit"
              : walletAddress
                ? "signed by your connected wallet"
                : "guest mode — attempts are still tracked"}
          </span>
          <span className="font-mono text-[10px] text-cyan-300/80">
            no fee in this phase
          </span>
        </div>

        {needsWallet ? (
          <button
            type="button"
            onClick={onConnectWallet}
            disabled={isConnecting}
            className="group relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-400/25 to-orange-500/20 font-mono text-xs font-bold uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-300/70 hover:from-amber-400/35 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConnecting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                OPENING METAMASK...
              </>
            ) : (
              "CONNECT METAMASK TO SUBMIT"
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={blocked}
            className="group relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400/25 to-violet-500/25 font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-100 transition hover:border-cyan-300/70 hover:from-cyan-400/35 hover:to-violet-500/35 disabled:cursor-not-allowed disabled:border-slate-700 disabled:from-transparent disabled:to-transparent disabled:text-slate-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                WAITING FOR CONSENSUS...
              </>
            ) : attemptsExhausted ? (
              "LIFETIME ATTEMPTS USED UP"
            ) : (
              <>
                <Send size={14} className="transition group-hover:translate-x-0.5" />
                SUBMIT FOR ORIGINALITY AUDIT
              </>
            )}
          </button>
        )}

        <AnimatePresence>
          {lastSubmission ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-xl border p-4 ${
                lastSubmission.record.isApproved
                  ? "border-emerald-300/30 bg-emerald-400/[0.07]"
                  : "border-rose-300/30 bg-rose-400/[0.07]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={`font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${
                    lastSubmission.record.isApproved
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  Verdict:{" "}
                  {lastSubmission.record.isApproved ? "APPROVED" : "REJECTED"}
                </p>
                <a
                  href={
                    mode === "live"
                      ? `https://explorer-studio.genlayer.com/tx/${lastSubmission.hash}`
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-[10px] text-slate-400 transition hover:text-cyan-300"
                >
                  {mode === "live" ? "View transaction" : "Local transaction"}{" "}
                  {shortHash(lastSubmission.hash, 6)}
                  <ArrowUpRight size={11} />
                </a>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-300">
                Judge explanation: {lastSubmission.record.auditReason}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
