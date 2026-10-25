import { useState } from "react";
import { AssessmentEntryWorkspace } from "@/components/school/assessment-entry-workspace";
import { AssessmentSetupWorkspace } from "@/components/school/assessment-setup";
import { ReportPublicationWorkspace } from "@/components/school/report-publication-workspace";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "marks", label: "Enter marks" },
  { id: "setup", label: "Assessment setup" },
  { id: "reports", label: "Reports & publication" },
] as const;

export function AssessmentsAdmin() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("marks");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Assessments" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-card p-1.5">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={cn("shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition", tab === item.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted")}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "marks" ? <AssessmentEntryWorkspace mode="manager" onOpenSetup={() => setTab("setup")} /> : tab === "setup" ? <AssessmentSetupWorkspace /> : <ReportPublicationWorkspace onOpenSetup={() => setTab("setup")} />}
    </div>
  );
}
