import { schoolAccessIdentifierSchema, schoolAccessMatchesSchema, type SchoolAccessMatch } from "@schoolhub/shared";
import { ArrowRight, School } from "lucide-react";
import { SchoolEntryLoading, VerifiedSchoolProvider } from "@/components/auth/school-entry";
import { DESKTOP_SESSION_NOTICE } from "./session";
import { DESKTOP_ACCESS_EVENT, type DesktopAccessIssue } from "./access";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { platform, DESKTOP_SCHOOL_KEY } from "./index";
import { resolveTenantSubdomain } from "../../tenant-subdomain-resolution";

function schoolSubdomain(value: string) {
  return resolveTenantSubdomain("localhost", `?school=${encodeURIComponent(value)}`);
}

/** School selection precedes mounting auth hooks or tenant-specific query caches. */
export default function DesktopSchoolGate({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState(() => platform.tenantSubdomain() ?? "");
  const [lookup, setLookup] = useState(() => code ? { identifier: code, restoring: true } : null);
  const [matches, setMatches] = useState<SchoolAccessMatch[]>([]);
  const [selection, setSelection] = useState<SchoolAccessMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<DesktopAccessIssue | null>(
    null,
  );
  useEffect(() => {
    const listener = (event: Event) =>
      setAccessIssue((event as CustomEvent<DesktopAccessIssue>).detail);
    const notice = (event: Event) =>
      setSavedNotice((event as CustomEvent<string>).detail);
    window.addEventListener(DESKTOP_SESSION_NOTICE, notice);
    window.addEventListener(DESKTOP_ACCESS_EVENT, listener);
    return () => {
      window.removeEventListener(DESKTOP_ACCESS_EVENT, listener);
      window.removeEventListener(DESKTOP_SESSION_NOTICE, notice);
    };
  }, []);
  useEffect(() => {
    if (!lookup) return;
    const { identifier, restoring } = lookup;

    const controller = new AbortController();
    async function verify() {
      try {
        const response = await platform.fetch(`/api/schools/public/access/${identifier}`, {
          signal: controller.signal,
        });
        if (response.status === 429) throw new Error("Too many school lookups. Try again in a minute.");
        if (!response.ok) throw new Error("School lookup is unavailable. Try again.");
        const result = schoolAccessMatchesSchema.safeParse(await response.json().catch(() => null));
        if (!result.success) throw new Error("The server returned an invalid school lookup. Try again.");
        const schools = result.data.filter((school) => schoolSubdomain(school.subdomain) === school.subdomain);
        if (controller.signal.aborted) return;
        const storedSchool = restoring ? schools.find((school) => school.subdomain === identifier) : undefined;
        const found = storedSchool ?? (schools.length === 1 ? schools[0] : undefined);
        if (found) setSelection(found);
        else if (schools.length) setMatches(schools);
        else setError("No school matches that code. Check the code and try again.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(error instanceof Error ? error.message : "Could not check that school code. Try again.");
      } finally {
        if (!controller.signal.aborted) setLookup(null);
      }
    }
    void verify();
    return () => controller.abort();
  }, [lookup]);

  useEffect(() => {
    if (!selection) return;
    let active = true;
    const school = selection;
    async function openSchool() {
      try {
        await platform.prepareSignIn?.(school.subdomain);
        if (!active) return;
        window.sessionStorage.setItem(DESKTOP_SCHOOL_KEY, school.subdomain);
        setReady(true);
      } catch {
        if (active) {
          setSelection(null);
          setError("Could not open that school. Try again.");
        }
      }
    }
    void openSchool();
    return () => { active = false; };
  }, [selection]);

  if (accessIssue)
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <section
          role="alert"
          className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8"
        >
          <h1 className="text-2xl font-semibold">
            {accessIssue.kind === "update"
              ? "Update required"
              : "Desktop access unavailable"}
          </h1>
          <p className="text-sm text-muted-foreground">{accessIssue.message}</p>
          <p className="text-sm text-muted-foreground">
            {accessIssue.kind === "update"
              ? "Install the available update or ask your administrator for the latest SchoolHub Desktop installer."
              : "Your administrator can check the school's subscription and desktop access."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          >
            Try again
          </button>
        </section>
      </main>
    );
  if (ready && selection)
    return (
      <>
        {savedNotice && (
          <div
            role="status"
            className="border-b border-border bg-muted px-4 py-3 text-sm text-foreground"
          >
            {savedNotice}
            <button
              type="button"
              aria-label="Dismiss sign-in notice"
              onClick={() => setSavedNotice(null)}
              className="ml-3 font-semibold text-primary"
            >
              Dismiss
            </button>
          </div>
        )}
        <VerifiedSchoolProvider school={selection}>{children}</VerifiedSchoolProvider>
      </>
    );
  if (lookup || selection) {
    return (
      <SchoolEntryLoading
        title={selection ? `Opening ${selection.name}` : "Finding your school"}
        detail={selection ? "Getting the sign-in page ready." : "Checking your school code with SchoolHub."}
      />
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const identifier = schoolAccessIdentifierSchema.safeParse(code);
    setMatches([]);
    if (!identifier.success) {
      setError(identifier.error.issues[0]?.message ?? "Enter a valid school code.");
      return;
    }
    setError(null);
    setLookup({ identifier: identifier.data, restoring: false });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-linear-to-br from-primary/10 via-background to-accent/50 px-6 text-foreground">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-8 shadow-xl">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <School className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">Find your school</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the school code or address prefix provided by your administrator.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="desktop-school">School code</label>
          <input
            id="desktop-school"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
              setMatches([]);
            }}
            required
            maxLength={63}
            autoComplete="organization"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "desktop-school-error" : undefined}
            autoFocus
            className="w-full rounded-xl border border-input bg-background px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p id="desktop-school-error" role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        {matches.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Choose your school</p>
            {matches.map((school) => (
              <button key={school.subdomain} type="button" onClick={() => setSelection(school)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent">
                <span>
                  <span className="block text-sm font-semibold">{school.name}</span>
                  <span className="text-xs text-muted-foreground">{school.subdomain} · {school.code}</span>
                </span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          Continue <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </form>
    </main>
  );
}
