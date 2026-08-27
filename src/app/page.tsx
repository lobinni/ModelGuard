"use client";

import dynamic from "next/dynamic";

import { AlertCircle, GitBranch, ShieldCheck, X } from "lucide-react";

import { ConsensusVisualizer } from "@/components/consensus/ConsensusVisualizer";
import { MetricRail } from "@/components/dashboard/MetricRail";
import { RecentRecords } from "@/components/dashboard/RecentRecords";
import { RegistryPulse } from "@/components/dashboard/RegistryPulse";
import { AppHeader } from "@/components/layout/AppHeader";
import { ModelRegistrationForm } from "@/components/registration/ModelRegistrationForm";
import { genlayerConfig, useModelGuard } from "@/hooks/useModelGuard";

const SecurityScene = dynamic(
  async () =>
    import("@/components/scene/SecurityScene").then((module) => ({
      default: module.SecurityScene,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="security-scene scene-fallback" aria-hidden="true" />
    ),
  },
);

export default function Page() {
  const controller = useModelGuard();
  const mode = controller.snapshot?.mode ?? genlayerConfig.mode;
  const paused = controller.snapshot?.paused ?? false;
  const stats = controller.snapshot?.stats ?? null;
  const recentRecords = controller.snapshot?.recentRecords ?? [];

  return (
    <div className="relative min-h-screen">
      <SecurityScene phase={controller.progress.phase} />
      <div className="grid-veil pointer-events-none fixed inset-0 z-[1]" aria-hidden="true" />

      <div className="relative z-10">
        <AppHeader
          wallet={controller.wallet}
          network={genlayerConfig.network}
          mode={mode}
          paused={paused}
          isConnecting={controller.isConnecting}
          isRefreshing={controller.isLoading}
          onConnect={() => void controller.connect()}
          onRefresh={() => void controller.refresh()}
        />

        {controller.error ? (
          <div
            role="alert"
            className="mx-auto mt-4 flex max-w-7xl items-center gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 font-mono text-xs text-rose-200 backdrop-blur sm:mx-6 lg:mx-auto"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{controller.error}</span>
            <button
              type="button"
              onClick={controller.clearError}
              aria-label="Dismiss error"
              className="rounded p-1 transition hover:bg-rose-400/20"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        {controller.isOwner ? (
          <div className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-400/[0.06] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-200 backdrop-blur sm:mx-6 lg:mx-auto">
            <ShieldCheck size={14} />
            Owner console — {mode === "live" ? "live network control" : "local mirror control"}
            <button
              type="button"
              onClick={() => void controller.setPaused(!paused)}
              className="ml-auto rounded-lg border border-amber-300/40 px-3 py-1 transition hover:bg-amber-400/15"
            >
              {paused ? "RESUME REGISTRATION" : "PAUSE REGISTRATION"}
            </button>
          </div>
        ) : null}

        <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
          <section className="relative flex min-h-[46vh] flex-col justify-end pb-6 pt-16 sm:pt-24">
            <RegistryPulse
              mode={mode}
              totalAttempts={stats?.totalAttempts ?? 0}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 right-0 hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500 lg:flex"
            >
              <span>Validator lattice</span>
              <strong className="font-semibold text-cyan-300/80">
                five nodes replaying every audit
              </strong>
              <span className="h-px w-16 bg-gradient-to-r from-cyan-300/50 to-transparent" />
            </div>
          </section>

          <section
            aria-label="How to join"
            className="mb-4 grid gap-3 md:grid-cols-3"
          >
            {[
              {
                step: "Step 1",
                title: "Install MetaMask",
                text: "You need a browser wallet to sign registrations. Get MetaMask from metamask.io if you do not have one yet.",
              },
              {
                step: "Step 2",
                title: "Connect and switch network",
                text: "Press Connect MetaMask. The wallet will offer to add and switch to GenLayer Studionet (chain id 61999) — approve it.",
              },
              {
                step: "Step 3",
                title: "Register a model",
                text: "Fill the form yourself or start from a sample, submit, then watch five validators replay the audit and agree on the verdict.",
              },
            ].map((item) => (
              <article key={item.step} className="glass-card p-4 sm:p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">
                  {item.step}
                </p>
                <h3 className="mt-2 font-display text-base font-bold text-slate-100">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {item.text}
                </p>
              </article>
            ))}
          </section>

          <MetricRail
            stats={stats}
            mode={mode}
            liveQueue={controller.isSubmitting ? 1 : 0}
            isLoading={controller.isLoading}
          />

          <section
            aria-label="Model audit workspace"
            className="mt-4 grid gap-4 lg:grid-cols-2"
          >
            <ModelRegistrationForm
              mode={mode}
              walletAddress={controller.wallet?.address ?? null}
              remainingAttempts={controller.remainingAttempts}
              paused={paused}
              isSubmitting={controller.isSubmitting}
              isConnecting={controller.isConnecting}
              lastSubmission={controller.lastSubmission}
              onSubmit={controller.submit}
              onConnectWallet={() => void controller.connect()}
            />
            <ConsensusVisualizer
              progress={controller.progress}
              mode={mode}
              transactionHash={controller.lastSubmission?.hash ?? null}
              votes={controller.lastSubmission?.votes ?? []}
            />
          </section>

          <div className="mt-4">
            <RecentRecords
              records={recentRecords}
              mode={mode}
              isLoading={controller.isLoading}
            />
          </div>
        </main>

        <footer className="border-t border-sky-200/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck size={14} className="text-cyan-300" />
              ModelGuard AI · semantic originality registry
            </div>
            <p className="text-center normal-case tracking-normal">
              Consensus records originality claims. It does not grant legal IP rights.
            </p>
            {genlayerConfig.contractAddress ? (
              <a
                href={`https://explorer-studio.genlayer.com/address/${genlayerConfig.contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 transition hover:text-cyan-300"
              >
                <GitBranch size={12} />
                View contract on explorer
              </a>
            ) : (
              <a
                href="https://github.com/genlayerlabs"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 transition hover:text-cyan-300"
              >
                <GitBranch size={12} />
                GenLayer
              </a>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
