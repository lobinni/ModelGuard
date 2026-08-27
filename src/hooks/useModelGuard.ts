"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { genlayerConfig } from "@/lib/config";
import { errorMessage } from "@/lib/format";
import {
  connectWallet,
  getRegistrySnapshot,
  registerModel,
  setRegistrationPaused,
} from "@/lib/genlayer";
import { GUEST_REGISTRANT, validateModelDraft } from "@/lib/validation";
import type {
  AuditProgress,
  ModelDraft,
  RegistrySnapshot,
  SubmissionResult,
  WalletConnection,
} from "@/types/model";

export { genlayerConfig };

const IDLE_PROGRESS: AuditProgress = {
  phase: "idle",
  label: "Consensus idle",
  detail: "Submit a model architecture to begin the originality audit.",
};

type SnapshotState = RegistrySnapshot & { remainingAttempts: number | null };

export interface ModelGuardController {
  snapshot: SnapshotState | null;
  wallet: WalletConnection | null;
  isOwner: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  progress: AuditProgress;
  lastSubmission: SubmissionResult | null;
  remainingAttempts: number;
  error: string | null;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  submit: (draft: ModelDraft) => Promise<SubmissionResult | null>;
  setPaused: (paused: boolean) => Promise<void>;
  clearError: () => void;
}

export function useModelGuard(): ModelGuardController {
  const [snapshot, setSnapshot] = useState<SnapshotState | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<AuditProgress>(IDLE_PROGRESS);
  const [lastSubmission, setLastSubmission] =
    useState<SubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletRef = useRef<WalletConnection | null>(null);
  walletRef.current = wallet;

  const activeAddress = useCallback(
    () => walletRef.current?.address ?? GUEST_REGISTRANT,
    [],
  );

  const loadSnapshot = useCallback(async () => {
    const next = await getRegistrySnapshot(activeAddress());
    setSnapshot(next);
  }, [activeAddress]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadSnapshot();
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const connection = await connectWallet();
      setWallet(connection);
      walletRef.current = connection;
      await loadSnapshot();
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setIsConnecting(false);
    }
  }, [loadSnapshot]);

  const submit = useCallback(
    async (draft: ModelDraft): Promise<SubmissionResult | null> => {
      if (isSubmitting) {
        return null;
      }
      const validation = validateModelDraft(draft);
      if (!validation.isValid) {
        setError(
          validation.errors.name ??
            validation.errors.architecture ??
            "The submission is invalid.",
        );
        return null;
      }

      setIsSubmitting(true);
      setError(null);
      setLastSubmission(null);
      setProgress({
        phase: "preparing",
        label: "Preparing submission",
        detail: "Checking your inputs and your remaining attempts.",
      });

      try {
        const result = await registerModel(
          validation.normalized,
          walletRef.current?.address ?? null,
          setProgress,
        );
        setLastSubmission(result);
        await loadSnapshot();
        return result;
      } catch (submitError) {
        const message = errorMessage(submitError);
        const stillProcessing = message.startsWith(
          "The network is still processing",
        );
        setProgress({
          phase: "failed",
          label: stillProcessing ? "Still processing on the network" : "Consensus reverted",
          detail: message,
        });
        setError(message);
        await loadSnapshot().catch(() => undefined);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, loadSnapshot],
  );

  const setPausedFlag = useCallback(
    async (paused: boolean) => {
      if (!walletRef.current) {
        setError("Connect the owner wallet to control registration pause.");
        return;
      }
      try {
        await setRegistrationPaused(walletRef.current.address, paused);
        await loadSnapshot();
      } catch (adminError) {
        setError(errorMessage(adminError));
      }
    },
    [loadSnapshot],
  );

  const clearError = useCallback(() => setError(null), []);

  const isOwner =
    wallet !== null &&
    snapshot?.owner !== null &&
    snapshot?.owner !== undefined &&
    wallet.address.toLowerCase() === snapshot.owner.toLowerCase();

  return {
    snapshot,
    wallet,
    isOwner,
    isConnecting,
    isLoading,
    isSubmitting,
    progress,
    lastSubmission,
    remainingAttempts: snapshot?.remainingAttempts ?? 3,
    error,
    connect,
    refresh,
    submit,
    setPaused: setPausedFlag,
    clearError,
  };
}
