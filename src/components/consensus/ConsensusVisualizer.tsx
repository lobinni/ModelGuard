"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  CheckCircle2,
  Copy,
  Radio,
  ServerCrash,
  Vote,
  XCircle,
} from "lucide-react";

import { shortHash } from "@/lib/format";
import type {
  AuditPhase,
  NetworkMode,
  ValidatorVote,
} from "@/types/model";

interface ConsensusVisualizerProps {
  progress: { phase: AuditPhase; label: string; detail: string };
  mode: NetworkMode;
  transactionHash: `0x${string}` | null;
  votes: ValidatorVote[];
}

const PHASE_ORDER: AuditPhase[] = [
  "idle",
  "preparing",
  "leader-analysis",
  "validator-replay",
  "vote-reveal",
  "finalized",
];

function phaseRank(phase: AuditPhase): number {
  if (phase === "failed") {
    return -1;
  }
  return PHASE_ORDER.indexOf(phase);
}

type NodeState = "pending" | "active" | "done" | "failed";

function stageState(
  stageIndex: number,
  phase: AuditPhase,
): NodeState {
  const rank = phaseRank(phase);
  if (phase === "failed") {
    return rank < 0 && stageIndex <= 2 ? "failed" : "pending";
  }
  const stageRank = stageIndex + 1; // leader -> 1, validators -> 2, vote -> 3
  if (phase === "finalized") {
    return "done";
  }
  if (rank === stageRank) {
    return "active";
  }
  if (rank > stageRank) {
    return "done";
  }
  return "pending";
}

const NODE_STYLE: Record<NodeState, string> = {
  pending: "border-slate-700/60 text-slate-600",
  active:
    "border-amber-300/60 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.18)]",
  done: "border-emerald-300/50 text-emerald-300",
  failed: "border-rose-400/60 text-rose-300",
};

const VALIDATORS = Array.from({ length: 5 }, (_, index) => `validator-0${index + 1}`);

export function ConsensusVisualizer({
  progress,
  mode,
  transactionHash,
  votes,
}: ConsensusVisualizerProps) {
  const { phase } = progress;
  const leaderState = stageState(0, phase);
  const validatorsState = stageState(1, phase);
  const voteState = stageState(2, phase);
  const finalized = phase === "finalized";
  const failed = phase === "failed";

  const approvedVotes = votes.filter((vote) => vote.decision === "APPROVED").length;

  return (
    <section
      aria-label="Consensus pipeline"
      className="glass-card relative flex flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-sky-200/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Radio size={15} className="text-cyan-300" />
          <h2 className="panel-title">Consensus pipeline</h2>
        </div>
        <span className="chip border-sky-200/15 text-slate-400">
          {mode === "live" ? "live network" : "local mirror"}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}-${progress.label}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-sky-200/10 bg-[#060d1c] px-4 py-3"
          >
            <p className="flex items-center gap-2 font-display text-sm font-semibold text-slate-100">
              <span
                className={`h-2 w-2 rounded-full ${
                  failed
                    ? "bg-rose-400"
                    : finalized
                      ? "bg-emerald-400"
                      : phase === "idle"
                        ? "bg-slate-600"
                        : "animate-pulse bg-amber-300"
                }`}
              />
              {progress.label}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-400">
              {progress.detail}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Stage 1: leader */}
        <div>
          <p className="metric-label mb-2">Step 1 — Lead validator (the Chief Judge)</p>
          <div
            className={`flex items-center gap-3 rounded-xl border bg-white/[0.02] px-4 py-3 transition ${NODE_STYLE[leaderState]}`}
          >
            <BrainCircuit size={17} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-bold tracking-[0.14em]">
                Semantic originality audit
              </p>
              <p className="truncate font-mono text-[10px] text-slate-500">
                Compares your model against the latest 64 approved records and
                answers with a verdict and a short reason.
              </p>
            </div>
            {leaderState === "done" ? <CheckCircle2 size={15} /> : null}
          </div>
        </div>

        <Connector active={phaseRank(phase) >= 3 || finalized} />

        {/* Stage 2: validators */}
        <div>
          <p className="metric-label mb-2">Step 2 — Validators replay the audit</p>
          <div className="grid grid-cols-5 gap-2">
            {VALIDATORS.map((name, index) => {
              const vote = votes.find((entry) => entry.node === name);
              return (
                <div
                  key={name}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-center transition ${NODE_STYLE[validatorsState]}`}
                  style={{ transitionDelay: `${index * 60}ms` }}
                >
                  <Vote size={13} />
                  <span className="font-mono text-[9px] tracking-tight">
                    v-{index + 1}
                  </span>
                  {vote && (voteState === "done" || finalized) ? (
                    <span
                      className={`font-mono text-[8px] font-bold ${
                        vote.decision === "APPROVED"
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }`}
                    >
                      {vote.decision === "APPROVED" ? "YES" : "NO"}
                    </span>
                  ) : (
                    <span className="font-mono text-[8px] text-slate-600">
                      {validatorsState === "active" ? "RUN" : "WAIT"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Connector active={phaseRank(phase) >= 4 || finalized} />

        {/* Stage 3: vote reveal / finality */}
        <div>
          <p className="metric-label mb-2">Step 3 — Verdicts must agree</p>
          <div
            className={`rounded-xl border px-4 py-3 transition ${
              failed
                ? NODE_STYLE.failed
                : finalized || voteState === "done"
                  ? finalized
                    ? "border-emerald-300/50 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.15)]"
                    : NODE_STYLE.active
                  : NODE_STYLE.pending
            }`}
          >
            {failed ? (
              <p className="flex items-center gap-2 font-mono text-xs">
                <ServerCrash size={14} />
                The transaction was reverted — nothing was written to the
                network and your attempt was not consumed.
              </p>
            ) : finalized ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.14em]">
                  <CheckCircle2 size={14} />
                  {votes.length > 0
                    ? `Validators agreed · ${approvedVotes} of ${votes.length} approve`
                    : "Finalized on the network"}
                </p>
                {transactionHash ? (
                  <a
                    href={`https://explorer-studio.genlayer.com/tx/${transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 transition hover:text-cyan-300"
                  >
                    <Copy size={10} />
                    View transaction {shortHash(transactionHash, 6)}
                  </a>
                ) : null}
              </div>
            ) : voteState === "active" ? (
              <p className="flex items-center gap-2 font-mono text-xs">
                <Vote size={14} className="animate-pulse" />
                Comparing verdicts — the reasons may differ, the decisions must
                match.
              </p>
            ) : (
              <p className="flex items-center gap-2 font-mono text-xs">
                <XCircle size={14} className="opacity-60" />
                Verdicts appear here once the validators finish their replay.
              </p>
            )}
          </div>
        </div>

        <p className="mt-auto border-t border-sky-200/10 pt-3 font-mono text-[10px] leading-relaxed text-slate-500">
          Every validator repeats the same audit on its own. The network only
          writes the record when their decisions agree — the wording of the
          reasons may differ, the decision may not.
        </p>
      </div>
    </section>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto h-5 w-px overflow-hidden">
      <div
        className={`absolute inset-0 ${
          active
            ? "bg-gradient-to-b from-cyan-300/70 to-transparent"
            : "bg-slate-700/50"
        }`}
      />
      {active ? (
        <div className="connector-pulse absolute inset-x-0 h-2 w-px bg-cyan-200" />
      ) : null}
    </div>
  );
}
