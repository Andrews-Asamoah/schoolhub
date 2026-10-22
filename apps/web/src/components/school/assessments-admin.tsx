import { useState } from "react";
import { AssessmentEntryWorkspace } from "@/components/school/assessment-entry-workspace";
import { AssessmentSetupWorkspace } from "@/components/school/assessment-setup";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "marks", label: "Enter marks" },
  { id: "setup", label: "Assessment setup" },
] as const;

/** The Assessments page for owners, administrators and headmistresses. */
export function AssessmentsAdmin() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("marks");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Assessments" className="flex w-fit gap-1 rounded-2xl border border-slate-200/80 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-xl px-4 py-2 text-xs font-semibold transition",
              tab === item.id ? "bg-indigo-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "marks" ? <AssessmentEntryWorkspace mode="manager" onOpenSetup={() => setTab("setup")} /> : <AssessmentSetupWorkspace />}
    </div>
  );
}
