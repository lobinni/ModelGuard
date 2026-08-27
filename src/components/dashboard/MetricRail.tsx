"use client";

import { useEffect, useRef } from "react";

import { animate } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Database,
  Gauge,
  XCircle,
} from "lucide-react";

import { approvalRate, formatRegistryCount } from "@/lib/format";
import type { NetworkMode, RegistryStats } from "@/types/model";

interface MetricRailProps {
  stats: RegistryStats | null;
  mode: NetworkMode;
  liveQueue: number;
  isLoading: boolean;
}

function AnimatedValue({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = formatRegistryCount(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [value]);

  return <span ref={ref}>0</span>;
}

export function MetricRail({ stats, mode, liveQueue, isLoading }: MetricRailProps) {
  const rate = approvalRate(
    stats?.approvedRecords ?? 0,
    stats?.rejectedRecords ?? 0,
  );

  const cards = [
    {
      key: "records",
      label: "Records sealed",
      value: stats?.totalRecords ?? 0,
      icon: Database,
      tone: "text-cyan-300",
      border: "from-cyan-400/50",
      sub: mode === "live" ? "stored on the network" : "stored in the local mirror",
    },
    {
      key: "attempts",
      label: "Attempts consumed",
      value: stats?.totalAttempts ?? 0,
      icon: Gauge,
      tone: "text-violet-300",
      border: "from-violet-400/50",
      sub: `limit: 3 per wallet${liveQueue ? " · one audit running" : ""}`,
    },
    {
      key: "approved",
      label: "Approved verdicts",
      value: stats?.approvedRecords ?? 0,
      icon: CheckCircle2,
      tone: "text-emerald-300",
      border: "from-emerald-400/50",
      sub: `${rate}% approval rate`,
    },
    {
      key: "rejected",
      label: "Rejected verdicts",
      value: stats?.rejectedRecords ?? 0,
      icon: XCircle,
      tone: "text-rose-300",
      border: "from-rose-400/50",
      sub: "kept as public evidence",
    },
  ];

  return (
    <section aria-label="Registry metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.key}
            className="glass-card relative overflow-hidden p-4 sm:p-5"
          >
            <div
              className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${card.border} to-transparent`}
            />
            <div className="flex items-center justify-between">
              <p className="metric-label">{card.label}</p>
              <Icon size={15} className={card.tone} />
            </div>
            <p className={`mt-3 font-display text-3xl font-bold tabular-nums sm:text-4xl ${card.tone}`}>
              {isLoading && !stats ? (
                <span className="animate-pulse text-slate-600">--</span>
              ) : (
                <AnimatedValue value={card.value} />
              )}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <Activity size={10} className="shrink-0" />
              {card.sub}
            </p>
          </article>
        );
      })}
    </section>
  );
}
