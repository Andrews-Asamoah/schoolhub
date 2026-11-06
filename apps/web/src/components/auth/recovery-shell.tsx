import type { ReactNode } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/school/theme-toggle";
export const recoveryInput =
  "h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
export const recoveryButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50";
export function RecoveryShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <GraduationCap className="size-6" />
          SchoolHub
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
        <p className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Password recovery keeps authenticator verification enabled. If you
          cannot access your authenticator, use a backup code or contact your
          school administrator.
        </p>
      </section>
    </main>
  );
}
