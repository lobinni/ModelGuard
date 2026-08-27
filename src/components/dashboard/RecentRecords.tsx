"use client";

import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ScrollText, XCircle } from "lucide-react";

import { formatTimestamp, shortAddress } from "@/lib/format";
import type { ModelRecord, NetworkMode } from "@/types/model";

interface RecentRecordsProps {
  records: ModelRecord[];
  mode: NetworkMode;
  isLoading: boolean;
}

function VerdictBadge({ approved }: { approved: boolean }) {
  return approved ? (
    <span className="chip border-emerald-300/30 text-emerald-300">
      <CheckCircle2 size={11} />
      APPROVED
    </span>
  ) : (
    <span className="chip border-rose-300/30 text-rose-300">
      <XCircle size={11} />
      REJECTED
    </span>
  );
}

export function RecentRecords({ records, mode, isLoading }: RecentRecordsProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <section aria-label="Recent finalized records" className="glass-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-sky-200/10 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <ScrollText size={15} className="text-cyan-300" />
          <h2 className="panel-title">Recent finalized records</h2>
        </div>
        <span className="chip border-sky-200/15 text-slate-400">
          {mode === "live" ? "live network" : "local mirror"}
        </span>
      </header>

      {isLoading && records.length === 0 ? (
        <div className="space-y-2 p-4 sm:p-5">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-14 animate-pulse rounded-lg bg-white/[0.04]"
            />
          ))}
        </div>
      ) : records.length === 0 ? (
        <p className="px-6 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
          Registry is empty — submit the first architecture
        </p>
      ) : (
        <ul className="divide-y divide-sky-200/[0.07]">
          {records.map((record) => {
            const expanded = expandedId === record.modelId;
            return (
              <li key={record.modelId}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(expanded ? null : record.modelId)
                  }
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 text-left transition hover:bg-cyan-300/[0.04] sm:grid-cols-[3.5rem_1.6fr_1fr_auto_auto] sm:gap-4 sm:px-6"
                >
                  <span className="font-mono text-xs text-slate-500">
                    #{String(record.modelId).padStart(3, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-semibold text-slate-100">
                      {record.modelName}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      {formatTimestamp(record.timestamp)}
                    </span>
                  </span>
                  <span className="hidden font-mono text-xs text-slate-400 sm:block">
                    {shortAddress(record.registrant)}
                  </span>
                  <VerdictBadge approved={record.isApproved} />
                  <ChevronDown
                    size={14}
                    className={`text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mx-4 mb-4 rounded-lg border border-sky-200/10 bg-[#060d1c] p-4 sm:mx-6">
                        <p className="metric-label">Architecture evidence</p>
                        <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                          {record.architectureText}
                        </p>
                        {record.contentHash ? (
                          <>
                            <p className="metric-label mt-4">
                              Verified source artifact
                            </p>
                            <a
                              href={record.artifactUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 block truncate font-mono text-[11px] text-cyan-300 transition hover:text-cyan-200"
                            >
                              {record.artifactUrl}
                            </a>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">
                              sha256 {record.contentHash.slice(0, 24)}...
                              {record.contentHash.slice(-8)}
                            </p>
                          </>
                        ) : null}
                        <p className="metric-label mt-4">Chief Judge reason</p>
                        <p
                          className={`mt-2 font-mono text-xs leading-relaxed ${
                            record.isApproved ? "text-emerald-300/90" : "text-rose-300/90"
                          }`}
                        >
                          {record.auditReason}
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
