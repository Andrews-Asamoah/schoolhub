import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> {label}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 p-8 text-sm text-destructive">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="superadmin-button-secondary rounded-lg px-3 py-1.5 text-xs font-semibold">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyPanel({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center p-12 text-center">
      <span className="mb-3 text-muted-foreground/60">{icon ?? <Inbox className="size-8" aria-hidden />}</span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
