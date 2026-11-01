import { Link } from "@tanstack/react-router";

/** Shown if a role without school-wide reporting opens /reports directly. */
export function ReportsRestrictedNotice() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">School-wide reports are for school leadership</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Your own marks and class results are under Assessments.
      </p>
      <Link to="/$page" params={{ page: "assessments" }} className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
        Go to Assessments
      </Link>
    </div>
  );
}
