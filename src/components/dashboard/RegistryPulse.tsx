"use client";

import { motion } from "framer-motion";
import { Fingerprint, Hourglass, Users } from "lucide-react";

import type { NetworkMode } from "@/types/model";

interface RegistryPulseProps {
  mode: NetworkMode;
  totalAttempts: number;
}

const PLEDGES = [
  { icon: Fingerprint, text: "Originality window: latest 64 approvals" },
  { icon: Users, text: "Five validators replay every audit" },
  { icon: Hourglass, text: "Three lifetime attempts per wallet" },
];

export function RegistryPulse({ mode, totalAttempts }: RegistryPulseProps) {
  return (
    <div className="relative z-10 max-w-3xl">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="font-mono text-[11px] uppercase tracking-[0.34em] text-cyan-300/90"
      >
        {mode === "live" ? "Live on GenLayer Studionet" : "Local mirror active"} ·{" "}
        {totalAttempts} attempts used so far
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4 font-display text-4xl font-bold leading-[1.04] tracking-tight text-slate-50 sm:text-6xl lg:text-7xl"
      >
        AI architectures,
        <br />
        <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
          adjudicated by consensus.
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base"
      >
        ModelGuard runs an LLM Chief Judge audit over the 64 most recent
        approved blueprints, then every validator replays it independently. The
        verdict — approved or rejected — is sealed on chain with its reason.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mt-7 flex flex-wrap gap-2"
      >
        {PLEDGES.map((pledge) => {
          const Icon = pledge.icon;
          return (
            <span key={pledge.text} className="chip border-sky-200/15 text-slate-300">
              <Icon size={12} className="text-cyan-300" />
              {pledge.text}
            </span>
          );
        })}
      </motion.div>
    </div>
  );
}
