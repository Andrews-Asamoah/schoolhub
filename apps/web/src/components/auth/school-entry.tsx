import { createContext, useContext, type ReactNode } from "react";
import type { SchoolAccessMatch } from "@schoolhub/shared";
import { LoaderCircle, School } from "lucide-react";

const VerifiedSchoolContext = createContext<SchoolAccessMatch | null>(null);

export function VerifiedSchoolProvider({ school, children }: { school: SchoolAccessMatch; children: ReactNode }) {
  return <VerifiedSchoolContext.Provider value={school}>{children}</VerifiedSchoolContext.Provider>;
}

export function useVerifiedSchool() {
  return useContext(VerifiedSchoolContext);
}

export function SchoolEntryLoading({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-linear-to-br from-primary/10 via-background to-accent/50 px-6 text-foreground">
      <section role="status" aria-live="polite" className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <School className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
        <LoaderCircle className="mx-auto mt-6 size-5 text-primary motion-safe:animate-spin" aria-hidden="true" />
      </section>
    </main>
  );
}
