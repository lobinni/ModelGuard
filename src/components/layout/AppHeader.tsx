"use client";

import {
  CircleDot,
  PauseOctagon,
  RefreshCw,
  ScanEye,
  Wallet,
} from "lucide-react";

import { shortAddress } from "@/lib/format";
import type { GenLayerNetwork, NetworkMode, WalletConnection } from "@/types/model";

interface AppHeaderProps {
  wallet: WalletConnection | null;
  network: GenLayerNetwork;
  mode: NetworkMode;
  paused: boolean;
  isConnecting: boolean;
  isRefreshing: boolean;
  onConnect: () => void;
  onRefresh: () => void;
}

export function AppHeader({
  wallet,
  network,
  mode,
  paused,
  isConnecting,
  isRefreshing,
  onConnect,
  onRefresh,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-sky-200/10 bg-[#030812]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/40 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 shadow-[0_0_24px_rgba(34,211,238,0.25)]">
            <ScanEye size={18} className="text-cyan-300" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold tracking-[0.18em] text-slate-100">
              MODELGUARD<span className="text-cyan-300">//</span>AI
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              GenLayer IP consensus
            </p>
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-2 md:flex">
          <span className="chip border-sky-300/20 text-sky-300">
            <CircleDot size={11} className="text-sky-400" />
            {network}
          </span>
          <span
            className={`chip ${
              mode === "live"
                ? "border-emerald-300/30 text-emerald-300"
                : "border-violet-300/30 text-violet-300"
            }`}
          >
            {mode === "live" ? "LIVE NETWORK" : "LOCAL MIRROR"}
          </span>
          {paused ? (
            <span className="chip border-amber-300/40 text-amber-300">
              <PauseOctagon size={11} />
              REGISTRATION PAUSED
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh registry snapshot"
            className="grid h-9 w-9 place-items-center rounded-lg border border-sky-200/15 bg-white/[0.03] text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={onConnect}
            disabled={isConnecting}
            className="group flex h-9 items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 font-mono text-xs tracking-wide text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            <Wallet size={14} className="transition group-hover:scale-110" />
            {isConnecting
              ? "CONNECTING..."
              : wallet
                ? shortAddress(wallet.address)
                : "CONNECT METAMASK"}
          </button>
        </div>
      </div>
    </header>
  );
}
