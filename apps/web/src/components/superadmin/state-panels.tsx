import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/skeleton";

export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return <LoadingState label={label} />;
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <ErrorState message={message} onRetry={onRetry} />;
}

export function EmptyPanel({
  title, description, icon, action,
}: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return <EmptyState title={title} description={description} iconNode={icon} action={action} />;
}
