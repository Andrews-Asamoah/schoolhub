import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  HardDrive,
  RefreshCw,
  ServerCog,
  ShieldAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getMigrationCheckStatus, type HealthCheckStatus } from "./operations-health-status";

type CheckStatus = HealthCheckStatus;

interface OperationsHealth {
  status: "healthy" | "degraded";
  checkedAt: string;
  application: {
    status: "healthy" | "degraded";
    version: string;
    environment: string;
    commitSha: string;
  };
  migrations: {
    status: "current" | "mismatch" | "incomplete" | "not_configured" | "unavailable";
    latestApplied: string | null;
    unfinishedCount: number | null;
  };
  dependencies: {
    database: { status: "healthy" | "unavailable"; latencyMs: number | null };
    privateStorage?: { status: CheckStatus; latencyMs?: number | null };
    storage: { status: CheckStatus; latencyMs?: number | null };
    notifications: { status: CheckStatus };
    backgroundJobs: { status: CheckStatus; dead?: number; overdue?: number; expired?: number };
  };
}

const STATUS_COPY: Record<CheckStatus, string> = {
  healthy: "Operational",
  unavailable: "Unavailable",
  degraded: "Degraded",
  not_configured: "Not configured",
  not_instrumented: "Not monitored",
};

function statusClasses(status: CheckStatus) {
  if (status === "healthy") {
    return "border-success/25 bg-success/10 text-success";
  }
  if (status === "unavailable" || status === "degraded") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "not_configured") {
    return "border-warning/25 bg-warning/10 text-warning";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "healthy") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (status === "unavailable" || status === "degraded" || status === "not_configured") {
    return <AlertTriangle className="size-4" aria-hidden="true" />;
  }
  return <CircleHelp className="size-4" aria-hidden="true" />;
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OperationsHealthPanel() {
  const healthQuery = useQuery({
    queryKey: ["superadmin", "operations-health"],
    queryFn: () => apiFetch<OperationsHealth>("/super-admin/operations/health"),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const health = healthQuery.data;
  const overallStatus: CheckStatus = health?.status ?? "unavailable";
  const migrationStatus = getMigrationCheckStatus(health?.migrations.status);
  const migrationStatusCopy: Record<OperationsHealth["migrations"]["status"], string> = {
    current: "Matches expected build",
    mismatch: "Expected version mismatch",
    incomplete: "Incomplete migration detected",
    not_configured: "Expected version not configured",
    unavailable: "Migration status unavailable",
  };
  const checks = health
    ? [
        {
          key: "database",
          label: "Database",
          icon: Database,
          status: health.dependencies.database.status as CheckStatus,
          detail:
            health.dependencies.database.latencyMs === null
              ? "Response time unavailable"
              : `${health.dependencies.database.latencyMs} ms response time`,
        },
        {
          key: "storage",
          label: "File storage",
          icon: HardDrive,
          status: health.dependencies.storage.status,
          detail:
            health.dependencies.storage.status === "healthy" &&
            health.dependencies.storage.latencyMs != null
              ? `${health.dependencies.storage.latencyMs} ms response time`
              : health.dependencies.storage.status === "not_configured"
                ? "R2 credentials, bucket name, or public URL are not configured"
                : health.dependencies.storage.status === "unavailable"
                  ? "The configured object-storage bucket could not be reached"
                  : "Provider health check not configured",
        },
        ...(health.dependencies.privateStorage ? [{ key: "private-storage", label: "Private file storage", icon: HardDrive,
          status: health.dependencies.privateStorage.status, detail: health.dependencies.privateStorage.status === "healthy" ? "Private bucket reachable; public-access policy requires operator verification" : "Configure and verify the separate private bucket" }] : []),
        {
          key: "notifications",
          label: "Notifications",
          icon: BellRing,
          status: health.dependencies.notifications.status,
          detail: "Delivery provider health check not configured",
        },
        {
          key: "jobs",
          label: "Background jobs",
          icon: ServerCog,
          status: health.dependencies.backgroundJobs.status,
          detail: health.dependencies.backgroundJobs.dead !== undefined
            ? `${health.dependencies.backgroundJobs.dead} dead jobs · ${health.dependencies.backgroundJobs.overdue ?? 0} overdue · ${health.dependencies.backgroundJobs.expired ?? 0} expired leases`
            : "Worker heartbeat not configured",
        },
      ]
    : [];

  return (
    <section
      aria-labelledby="operations-health-heading"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="operations-health-heading" className="text-sm font-semibold text-foreground sm:text-base">
              Operations health
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Verified checks are separated from dependencies that are not yet monitored
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void healthQuery.refetch()}
          disabled={healthQuery.isFetching}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${healthQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          {healthQuery.isFetching ? "Checking…" : "Refresh"}
        </button>
      </div>

      {healthQuery.isPending ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading operations health">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : healthQuery.isError ? (
        <div role="alert" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Health status unavailable</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The platform health endpoint could not be reached. This does not confirm that services are down.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void healthQuery.refetch()}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : health ? (
        <>
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-6">
            <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses(overallStatus)}`}>
              <StatusIcon status={overallStatus} />
              {overallStatus === "healthy" ? "Core services operational" : "Service degradation detected"}
            </span>
            <span className="text-xs text-muted-foreground">
              <Clock3 className="mr-1 inline size-3.5" aria-hidden="true" />
              Checked {formatCheckedAt(health.checkedAt)}
            </span>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6">
            {checks.map((check) => {
              const Icon = check.icon;
              return (
                <article key={check.key} className="min-w-0 rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(check.status)}`}>
                      <StatusIcon status={check.status} />
                      {STATUS_COPY[check.status]}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{check.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                </article>
              );
            })}
          </div>
          <section className="mx-5 mb-5 rounded-xl border border-border p-4 sm:mx-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Deployment &amp; database migrations</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Build: <span className="font-mono text-foreground">{health.application.commitSha}</span>
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClasses(migrationStatus)}`}>
                <StatusIcon status={migrationStatus} />
                {migrationStatusCopy[health.migrations.status]}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {health.migrations.latestApplied
                ? `Latest successful migration: ${health.migrations.latestApplied}.`
                : "No successful migration could be identified."}
              {health.migrations.unfinishedCount !== null
                ? ` ${health.migrations.unfinishedCount} unfinished migration(s).`
                : ""}
            </p>
            {health.migrations.status === "not_configured" && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Configure EXPECTED_MIGRATION_NAME in trusted deployment metadata to compare the deployed database with the release's expected migration.
              </p>
            )}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground sm:px-6">
            <span>
              App version: <span className="font-medium text-foreground">{health.application.version}</span>
              <span className="mx-2 text-border">·</span>
              Environment: <span className="font-medium text-foreground">{health.application.environment}</span>
            </span>
            <span>Automatically refreshes every minute</span>
          </div>
          {checks.some((check) => check.status === "not_instrumented") && (
            <p className="px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
              “Not monitored” means a live provider or worker health contract has not been connected yet; it is not a healthy result.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
