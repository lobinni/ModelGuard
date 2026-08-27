export function asSafeNumber(value: unknown): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

export function shortAddress(address: string | null, visible = 5): string {
  if (!address) {
    return "Not connected";
  }
  if (address.length <= visible * 2 + 3) {
    return address;
  }
  return `${address.slice(0, visible + 2)}...${address.slice(-visible)}`;
}

export function formatRegistryCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) {
    return "Pending timestamp";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function approvalRate(approved: number, rejected: number): number {
  const decided = approved + rejected;
  if (decided === 0) {
    return 0;
  }
  return Math.round((approved / decided) * 1000) / 10;
}

export function shortHash(hash: string | null, visible = 8): string {
  if (!hash) {
    return "";
  }
  if (hash.length <= visible * 2 + 3) {
    return hash;
  }
  return `${hash.slice(0, visible + 2)}...${hash.slice(-visible)}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The request could not be completed.";
}
