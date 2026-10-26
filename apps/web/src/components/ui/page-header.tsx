import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One responsive heading language for school, finance and platform pages. */
export function PageHeader({
  eyebrow, title, description, icon: Icon, actions, className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-4 sm:items-center", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary sm:size-11">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  );
}
