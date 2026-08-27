import type { GenLayerNetwork } from "@/types/model";

const supportedNetworks: GenLayerNetwork[] = [
  "localnet",
  "studionet",
  "testnetAsimov",
  "testnetBradbury",
];

function normalizeNetwork(value: string | undefined): GenLayerNetwork {
  if (supportedNetworks.includes(value as GenLayerNetwork)) {
    return value as GenLayerNetwork;
  }
  return "studionet";
}

function normalizeAddress(value: string | undefined): `0x${string}` | null {
  const address = value?.trim();
  if (!address) {
    return null;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS must be a 20-byte hex address");
  }
  return address as `0x${string}`;
}

// No live default until the provenance-aware V3 source is freshly deployed.
// Vercel must provide NEXT_PUBLIC_CONTRACT_ADDRESS after schema verification;
// leaving it empty selects the local PostgreSQL mirror safely.
const DEFAULT_CONTRACT_ADDRESS = "";

function resolveContractAddress(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (configured === undefined) {
    return DEFAULT_CONTRACT_ADDRESS;
  }
  return configured === "" ? undefined : configured;
}

const contractAddress = normalizeAddress(resolveContractAddress());

// Live mode talks to the deployed AIModelGuard contract through genlayer-js.
// Demo mode drives the PostgreSQL localnet mirror served by /api/registry/*.
export const genlayerConfig = {
  network: normalizeNetwork(process.env.NEXT_PUBLIC_GENLAYER_NETWORK),
  contractAddress,
  mode: contractAddress ? "live" : "demo",
} as const;
