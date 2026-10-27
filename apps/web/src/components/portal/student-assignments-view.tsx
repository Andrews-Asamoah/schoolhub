import { ClipboardList, Info } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/**
 * The API currently has no persisted assignment/submission contract. Keep the
 * route honest until that contract exists: never show sample homework, fake
 * grades, or report a local-only submission as saved.
 */
export function StudentAssignmentsView() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Student portal"
        title="Assignments & coursework"
        description="View homework published by your teachers and review submission status."
        icon={ClipboardList}
      />
      <EmptyState
        icon={ClipboardList}
        title="Assignment records are not available yet"
        description="This workspace is not connected to a saved assignment and submission service yet. No sample tasks or scores are shown, and the page will not mark work as submitted unless the server can save that submission."
      />
      <section className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Need to check an assignment?</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Please use the communication channel your school has approved or contact your class teacher until online assignments are enabled for your school.</p>
        </div>
      </section>
    </div>
  );
}
