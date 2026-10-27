export type MigrationHealthStatus = "current" | "mismatch" | "incomplete" | "not_configured" | "unavailable";
export type HealthCheckStatus = "healthy" | "unavailable" | "not_instrumented" | "degraded";

/**
 * A migration baseline is healthy only when it is configured and verified.
 * An unconfigured baseline is a deployment problem, not an unmonitored dependency.
 */
export function getMigrationCheckStatus(status: MigrationHealthStatus | null | undefined): HealthCheckStatus {
  if (!status) return "unavailable";
  return status === "current" ? "healthy" : "degraded";
}
