import { DESKTOP_SESSION_NOTICE } from "./session";
import { DESKTOP_ACCESS_EVENT, type DesktopAccessIssue } from "./access";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { platform, DESKTOP_SCHOOL_KEY } from "./index";
import { resolveTenantSubdomain } from "../../tenant-subdomain-resolution";

/** School selection precedes mounting auth hooks or tenant-specific query caches. */
export default function DesktopSchoolGate({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(() => Boolean(platform.tenantSubdomain()));
  const [code, setCode] = useState("");
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
              ? "Ask your administrator for the latest SchoolHub Desktop installer."
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
  if (ready)
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
        {children}
      </>
    );
  function submit(event: FormEvent) {
    event.preventDefault();
    const slug = resolveTenantSubdomain(
      "localhost",
      `?school=${encodeURIComponent(code.trim())}`,
    );
    if (!slug || slug.length > 63) {
      setError("Enter a valid school code.");
      return;
    }
    try {
      window.sessionStorage.setItem(DESKTOP_SCHOOL_KEY, slug);
      setReady(true);
    } catch {
      setError(
        "School selection could not be saved. Restart the app and try again.",
      );
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-sm"
      >
        <div>
          <h1 className="text-2xl font-semibold">Your school on SchoolHub</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the school code provided by your administrator, then sign in.
          </p>
        </div>
        <label className="block text-sm font-medium" htmlFor="desktop-school">
          School code
        </label>
        <input
          id="desktop-school"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          maxLength={63}
          autoComplete="organization"
          autoFocus
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          Continue
        </button>
      </form>
    </main>
  );
}
