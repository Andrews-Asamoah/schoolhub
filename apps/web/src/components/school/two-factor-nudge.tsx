import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useSchoolRole } from "./school-role-switcher";

const DISMISS_KEY = "schoolhub:2fa-nudge-dismissed";

/**
 * A gentle prompt for school owners and administrators who have not turned on
 * two-factor authentication. Dismissal lasts for the browser session only, so
 * it returns next time. (When the platform makes 2FA mandatory, the API
 * redirects to the set-up page instead.)
 */
export function TwoFactorNudge() {
  const { data: session } = useSession();
  const { activeRole } = useSchoolRole();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  const isAdmin = activeRole === "owner" || activeRole === "admin";
  if (!session?.user || !isAdmin || session.user.twoFactorEnabled || dismissed) return null;

  return (
    <section aria-label="Security recommendation" className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning"><ShieldAlert className="size-5" /></span>
        <div>
          <p className="text-sm font-bold text-foreground">Protect your school with two-factor authentication</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Administrator accounts can see student records and fees. A second sign-in step keeps them safe even if a password leaks.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link to="/$page" params={{ page: "profile" }} className="superadmin-button-primary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold">
          Set it up <ArrowRight className="size-3.5" />
        </Link>
        <button type="button" aria-label="Remind me later" onClick={() => { try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ } setDismissed(true); }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}
