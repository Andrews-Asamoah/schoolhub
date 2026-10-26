import { CircleAlert, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title, description, icon: Icon = Inbox, action, className, compact = false,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cn(
      "flex min-w-0 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/70 px-5 text-center",
      compact ? "min-h-40 py-6" : "min-h-56 py-10 sm:py-12",
      className,
    )}>
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}

export function ErrorState({
  message, onRetry, className,
}: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex min-w-0 flex-wrap items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-6">{message}</p>
      {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
