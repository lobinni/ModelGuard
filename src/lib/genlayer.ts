"use client";

import { createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { CalldataAddress, TransactionStatus } from "genlayer-js/types";

import { genlayerConfig } from "@/lib/config";
import { asSafeNumber } from "@/lib/format";
import { normalizeWalletAddress } from "@/lib/validation";
import type {
  AuditProgress,
  ModelDraft,
  ModelRecord,
  RegistrySnapshot,
  RegistryStats,
  SubmissionResult,
  ValidatorVote,
  WalletConnection,
} from "@/types/model";

type ProgressListener = (progress: AuditProgress) => void;
type JsonRecord = Record<string, unknown>;

const chains = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} as const;

const configuredNetwork = genlayerConfig.network;
const configuredAddress = genlayerConfig.contractAddress;
const readClient = createClient({ chain: chains[configuredNetwork] });

function asRecord(value: unknown): JsonRecord {
  if (value instanceof Map) {
    return Object.fromEntries(value) as JsonRecord;
  }
  if (value && typeof value === "object") {
    return value as JsonRecord;
  }
  return {};
}

function normalizeStats(value: unknown): RegistryStats {
  const stats = asRecord(value);
  return {
    totalRecords: asSafeNumber(stats.total_records),
    totalAttempts: asSafeNumber(stats.total_attempts),
    approvedRecords: asSafeNumber(stats.approved_records),
    rejectedRecords: asSafeNumber(stats.rejected_records),
  };
}

function normalizeModel(value: unknown, modelId: number): ModelRecord {
  const record = asRecord(value);
  return {
    modelId,
    registrant: String(record.registrant ?? "Unknown registrant"),
    modelName: String(record.model_name ?? "Unnamed model"),
    architectureText: String(record.architecture_text ?? ""),
    artifactUrl: String(record.artifact_url ?? ""),
    contentHash: String(record.content_hash ?? ""),
    timestamp: asSafeNumber(record.timestamp),
    isApproved: Boolean(record.is_approved),
    auditReason: String(record.audit_reason ?? "No audit reason returned."),
  };
}

function requireContractAddress(): `0x${string}` {
  if (!configuredAddress) {
    throw new Error(
      "Set NEXT_PUBLIC_CONTRACT_ADDRESS to enable live contract access.",
    );
  }
  return configuredAddress;
}

async function requireProvenanceContract(
  address: `0x${string}`,
): Promise<void> {
  const schema = await readClient.getContractSchema(address);
  const method = schema.methods?.register_and_audit_model;
  const parameterNames = method?.params?.map(([name]) => name) ?? [];
  const expected = [
    "model_name",
    "architecture_text",
    "artifact_url",
    "content_hash",
  ];
  if (
    parameterNames.length !== expected.length ||
    expected.some((name, index) => parameterNames[index] !== name)
  ) {
    throw new Error(
      "The configured contract predates the verifiable-provenance upgrade. Deploy the current contracts/ai_model_guard.py and update NEXT_PUBLIC_CONTRACT_ADDRESS before submitting.",
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// GenLayer calldata encodes an Address as SPECIAL_ADDR + 20 raw bytes, not a
// hex string (a bare string is encoded as TEXT, and the GenVM then fails to
// execute the call — viem surfaces it as "Missing or invalid parameters ...
// execution failed"). Wrap every Address-typed argument explicitly.
function toCalldataAddress(address: string): CalldataAddress {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      clean.slice(index * 2, index * 2 + 2),
      16,
    );
  }
  return new CalldataAddress(bytes);
}

// Transaction status names on GenLayer (consensus pipeline). ACCEPTED means
// the validators already agreed — the record is written at that point, while
// FINALIZED only seals it after the appeal window minutes later.
const FAILED_STATES = new Set(["CANCELED", "UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

function receiptStatusName(receipt: unknown): string {
  const record = receipt as { statusName?: unknown; status?: unknown };
  if (typeof record.statusName === "string") {
    return record.statusName.toUpperCase();
  }
  const numeric = Number(record.status);
  const names = [
    "UNINITIALIZED",
    "PENDING",
    "PROPOSING",
    "COMMITTING",
    "REVEALING",
    "ACCEPTED",
    "UNDETERMINED",
    "FINALIZED",
    "CANCELED",
  ];
  return Number.isInteger(numeric) && names[numeric] ? names[numeric] : "UNKNOWN";
}

function isWaitTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Timed out waiting for transaction")
  );
}

export const isLiveMode = configuredAddress !== null;

async function fetchMirror<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord & T;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The registry mirror rejected the request.",
    );
  }
  return payload;
}

// get_registry_stats + get_model_record scan + get_owner +
// is_registration_paused — against the live contract in live mode, otherwise
// against the PostgreSQL localnet mirror served by the API routes.
export async function getRegistrySnapshot(
  callerAddress?: string | null,
): Promise<RegistrySnapshot & { remainingAttempts: number | null }> {
  if (!configuredAddress) {
    const query = callerAddress
      ? `?address=${encodeURIComponent(callerAddress)}`
      : "";
    const mirror = await fetchMirror<
      Omit<RegistrySnapshot, "mode"> & { remainingAttempts: number | null }
    >(`/api/registry/snapshot${query}`);
    return { ...mirror, mode: "demo" };
  }

  const [rawStats, rawOwner, rawPaused] = await Promise.all([
    readClient.readContract({
      address: configuredAddress,
      functionName: "get_registry_stats",
      args: [],
    }),
    readClient.readContract({
      address: configuredAddress,
      functionName: "get_owner",
      args: [],
    }),
    readClient.readContract({
      address: configuredAddress,
      functionName: "is_registration_paused",
      args: [],
    }),
  ]);

  const stats = normalizeStats(rawStats);
  const firstModelId = Math.max(0, stats.totalRecords - 5);
  const modelIds = Array.from(
    { length: stats.totalRecords - firstModelId },
    (_, index) => firstModelId + index,
  ).reverse();
  const recentRecords = await Promise.all(
    modelIds.map(async (modelId) => {
      const result = await readClient.readContract({
        address: configuredAddress,
        functionName: "get_model_record",
        args: [BigInt(modelId)],
      });
      return normalizeModel(result, modelId);
    }),
  );

  let remainingAttempts: number | null = null;
  if (callerAddress) {
    remainingAttempts = await getRemainingAttempts(callerAddress);
  }

  return {
    stats,
    recentRecords,
    owner: typeof rawOwner === "string" ? rawOwner : String(rawOwner),
    paused: Boolean(rawPaused),
    mode: "live",
    remainingAttempts,
  };
}

export async function getRemainingAttempts(address: string): Promise<number> {
  if (!configuredAddress) {
    const mirror = await fetchMirror<{ remaining_attempts: number }>(
      `/api/registry/attempts?address=${encodeURIComponent(address)}`,
    );
    return asSafeNumber(mirror.remaining_attempts);
  }
  const result = await readClient.readContract({
    address: configuredAddress,
    functionName: "get_remaining_attempts",
    args: [toCalldataAddress(address)],
  });
  return asSafeNumber(result);
}

// Make sure the connected wallet is on the configured GenLayer network. If
// the wallet has never seen the network, MetaMask is asked to add it first
// (chain parameters are derived from the canonical genlayer-js chain defs).
async function ensureWalletNetwork(provider: EthereumProvider): Promise<void> {
  const chain = chains[configuredNetwork];
  const chainIdHex = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return;
  } catch (switchError) {
    const code = (switchError as { code?: number } | null)?.code;
    if (code === 4001) {
      throw new Error(
        `Switch your wallet to ${chain.name} (chain id ${chain.id}) to continue.`,
      );
    }
    if (code !== 4902) {
      // Some wallets do not expose unrecognized-chain errors with code 4902;
      // fall through and try adding the network anyway.
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: chain.name,
              rpcUrls: [...chain.rpcUrls.default.http],
              nativeCurrency: chain.nativeCurrency,
              blockExplorerUrls: chain.blockExplorers?.default?.url
                ? [chain.blockExplorers.default.url]
                : undefined,
            },
          ],
        });
        return;
      } catch (addError) {
        const addCode = (addError as { code?: number } | null)?.code;
        if (addCode === 4001) {
          throw new Error(
            `Approve the ${chain.name} network in your wallet to continue.`,
          );
        }
        throw new Error(
          `Your wallet could not switch to ${chain.name}. Add it manually: RPC ${chain.rpcUrls.default.http[0]}, chain id ${chain.id}.`,
        );
      }
    }
  }
  // Chain unknown to the wallet (4902): add it, then MetaMask switches over.
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          rpcUrls: [...chain.rpcUrls.default.http],
          nativeCurrency: chain.nativeCurrency,
          blockExplorerUrls: chain.blockExplorers?.default?.url
            ? [chain.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  } catch (addError) {
    const addCode = (addError as { code?: number } | null)?.code;
    if (addCode === 4001) {
      throw new Error(
        `Approve the ${chain.name} network in your wallet to continue.`,
      );
    }
    throw new Error(
      `Your wallet could not add ${chain.name}. Add it manually: RPC ${chain.rpcUrls.default.http[0]}, chain id ${chain.id}.`,
    );
  }
}

export async function connectWallet(): Promise<WalletConnection> {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error(
      "Install MetaMask (https://metamask.io) to join the registry on GenLayer Studionet.",
    );
  }
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("The wallet did not return an account.");
  }
  const address = normalizeWalletAddress(accounts[0]);
  if (!address) {
    throw new Error("The wallet returned an invalid account.");
  }
  // Deliberately no chain switch here — connecting only reads the account.
  // The switch / add-network prompt appears right before the first on-chain
  // write instead, so browsing the registry never triggers wallet dialogs.
  return { address };
}

function scheduleMirrorProgress(onProgress: ProgressListener): () => void {
  const leaderTimer = window.setTimeout(() => {
    onProgress({
      phase: "leader-analysis",
      label: "Chief Judge analyzing",
      detail:
        "Your model is being compared with the latest 64 approved records.",
    });
  }, 250);
  const validatorTimer = window.setTimeout(() => {
    onProgress({
      phase: "validator-replay",
      label: "Validators replaying the audit",
      detail: "Five validators are repeating the originality check.",
    });
  }, 1400);
  const voteTimer = window.setTimeout(() => {
    onProgress({
      phase: "vote-reveal",
      label: "Revealing the verdicts",
      detail: "The validator decisions are being compared.",
    });
  }, 3200);

  return () => {
    window.clearTimeout(leaderTimer);
    window.clearTimeout(validatorTimer);
    window.clearTimeout(voteTimer);
  };
}

async function mirrorRegistration(
  draft: ModelDraft,
  account: string | null,
  onProgress: ProgressListener,
): Promise<SubmissionResult> {
  onProgress({
    phase: "preparing",
    label: "Preparing transaction",
    detail: "Checking your inputs and your remaining attempts.",
  });
  const stopProgress = scheduleMirrorProgress(onProgress);
  const minimumDuration = delay(4200);

  try {
    const result = await fetchMirror<{
      hash: `0x${string}`;
      record: ModelRecord;
      votes: ValidatorVote[];
    }>("/api/registry/register", {
      method: "POST",
      body: JSON.stringify({
        name: draft.name,
        architecture: draft.architecture,
        artifactUrl: draft.artifactUrl,
        contentHash: draft.contentHash,
        registrant: account ?? undefined,
      }),
    });
    await minimumDuration;
    onProgress({
      phase: "finalized",
      label: "Audit finalized",
      detail: result.record.isApproved
        ? "The validators agreed your architecture is original."
        : "The validators agreed it reproduces protected logic.",
    });
    return result;
  } catch (error) {
    await minimumDuration;
    throw error;
  } finally {
    stopProgress();
  }
}

// set_paused — mirror admin endpoint in demo mode, live owner transaction
// through genlayer-js when the contract address is configured.
export async function setRegistrationPaused(
  account: string,
  paused: boolean,
): Promise<`0x${string}` | null> {
  if (!configuredAddress) {
    await fetchMirror<{ owner: string; paused: boolean }>(
      "/api/registry/admin",
      {
        method: "POST",
        body: JSON.stringify({
          action: "set_paused",
          paused,
          caller: account,
        }),
      },
    );
    return null;
  }
  if (!window.ethereum) {
    throw new Error("The connected wallet provider is no longer available.");
  }
  await ensureWalletNetwork(window.ethereum);
  const writeClient = createClient({
    chain: chains[configuredNetwork],
    account: account as `0x${string}`,
    provider: window.ethereum,
  });
  const hash = await writeClient.writeContract({
    address: configuredAddress,
    functionName: "set_paused",
    args: [paused],
    value: BigInt(0),
  });
  await writeClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 2500,
  });
  return hash;
}

// register_and_audit_model — live transaction through genlayer-js, or the
// localnet mirror pipeline when no contract address is configured.
export async function registerModel(
  draft: ModelDraft,
  account: string | null,
  onProgress: ProgressListener,
): Promise<SubmissionResult> {
  if (!configuredAddress) {
    return mirrorRegistration(draft, account, onProgress);
  }
  if (!account) {
    throw new Error("Connect a wallet before registering a model.");
  }
  if (!window.ethereum) {
    throw new Error("The connected wallet provider is no longer available.");
  }

  const address = requireContractAddress();
  // Fail before switching the wallet network or asking MetaMask to sign when
  // the configured deployment still exposes the legacy two-argument method.
  await requireProvenanceContract(address);
  await ensureWalletNetwork(window.ethereum);
  const writeClient = createClient({
    chain: chains[configuredNetwork],
    account: account as `0x${string}`,
    provider: window.ethereum,
  });

  onProgress({
    phase: "preparing",
    label: "Preparing transaction",
    detail: "Confirm the transaction in MetaMask to send it to Studionet.",
  });
  const hash = await writeClient.writeContract({
    address,
    functionName: "register_and_audit_model",
    args: [draft.name, draft.architecture, draft.artifactUrl, draft.contentHash],
    value: BigInt(0),
  });

  onProgress({
    phase: "leader-analysis",
    label: "Chief Judge analyzing",
    detail:
      "The lead validator is auditing your model against the latest 64 approved records.",
  });
  await delay(1200);
  onProgress({
    phase: "validator-replay",
    label: "Validators replaying the audit",
    detail: "Independent validators are repeating the same audit.",
  });

  // Wait for ACCEPTED (validators have agreed; the record is now in storage).
  // Studionet consensus with the LLM audit commonly takes a few minutes, so
  // poll generously: 120 x 5s = up to ten minutes before reporting a timeout.
  let receipt: unknown;
  try {
    receipt = await writeClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      interval: 5000,
      retries: 120,
    });
  } catch (waitError) {
    if (isWaitTimeout(waitError)) {
      throw new Error(
        `The network is still processing your transaction ${hash.slice(0, 14)}...${hash.slice(-6)}. This is normal on Studionet — track it on the explorer and refresh this page in a few minutes to see your record.`,
      );
    }
    throw waitError instanceof Error
      ? waitError
      : new Error("The transaction status could not be read.");
  }

  const decided = receiptStatusName(receipt);
  if (FAILED_STATES.has(decided)) {
    throw new Error(
      `The validators did not reach agreement (${decided.toLowerCase().replaceAll("_", " ")}). The transaction was rolled back and your attempt was not consumed — reword your submission and try again.`,
    );
  }

  onProgress({
    phase: "vote-reveal",
    label: "Revealing the verdicts",
    detail: "The validators agreed — the record is written to the registry.",
  });

  const snapshot = await getRegistrySnapshot(account);
  const record =
    snapshot.recentRecords.find(
      (candidate) =>
        candidate.registrant.toLowerCase() === account.toLowerCase(),
    ) ?? snapshot.recentRecords[0];

  if (!record) {
    throw new Error(
      "The verdict was accepted but the record is not readable yet. Wait a moment, then press refresh — your record will appear.",
    );
  }

  onProgress({
    phase: "finalized",
    label: "Audit accepted by consensus",
    detail:
      "The verdict is written to the registry. The network is sealing finality in the background.",
  });

  // Keep waiting for FINALIZED (the appeal-window seal) in the background and
  // surface it when it lands — never fail the submission over this step.
  void writeClient
    .waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      interval: 15000,
      retries: 80,
    })
    .then(() => {
      onProgress({
        phase: "finalized",
        label: "Finalized on Studionet",
        detail: "The transaction is sealed. View it on the explorer anytime.",
      });
    })
    .catch(() => {
      // Finality can lag several minutes on Studionet; the accepted verdict
      // and the record are already authoritative for the UI.
    });

  return { hash, record, votes: [] };
}
