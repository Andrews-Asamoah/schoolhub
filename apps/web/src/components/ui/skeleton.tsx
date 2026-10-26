import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
}

export function LoadingState({
  label = "Loading…", className, variant = "spinner",
}: { label?: string; className?: string; variant?: "spinner" | "skeleton" }) {
  if (variant === "skeleton") {
    return (
      <div role="status" aria-label={label} className={cn("space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6", className)}>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={cn("flex min-h-36 items-center justify-center gap-3 rounded-xl border border-border bg-card/70 p-6 text-sm text-muted-foreground", className)}>
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
