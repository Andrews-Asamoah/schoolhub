export const STORAGE_HEALTH_PROBE = Symbol("STORAGE_HEALTH_PROBE");

export type StorageHealthResult =
  | { status: "healthy"; latencyMs: number }
  | { status: "not_configured" | "unavailable"; latencyMs: null };

export interface StorageHealthProbe {
  checkHealth(): Promise<StorageHealthResult>;
}
