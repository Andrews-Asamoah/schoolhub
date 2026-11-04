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
    <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-5 border-b border-border/70 pb-5 sm:items-center sm:pb-6", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-sm sm:size-12">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
          <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-[2rem]">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  );
}
