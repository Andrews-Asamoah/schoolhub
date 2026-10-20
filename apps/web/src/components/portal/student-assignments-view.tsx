import { useState } from "react";
import {
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  Search,
  Upload,
  X,
} from "lucide-react";
import { PortalModal } from "./portal-modal";
import { cn } from "@/lib/utils";

export interface StudentAssignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  maxScore: number;
  status: "PENDING" | "SUBMITTED" | "GRADED";
  score?: number;
  instructions: string;
  teacherRemarks?: string;
}

const mockAssignments: StudentAssignment[] = [
  {
    id: "asg-1",
    title: "Newton's Laws of Motion Lab Report",
    subject: "Integrated Science",
    dueDate: "Tomorrow at 11:59 PM",
    maxScore: 30,
    status: "PENDING",
    instructions: "Write a 2-page laboratory observation on our pendulum experiments. Include force diagram calculations.",
  },
  {
    id: "asg-2",
    title: "Quadratic Equations Problem Set 4",
    subject: "Core Mathematics",
    dueDate: "In 3 days",
    maxScore: 20,
    status: "PENDING",
    instructions: "Complete exercises 4.1 to 4.5 in your textbook. Show all step-by-step working clearly.",
  },
  {
    id: "asg-3",
    title: "Expository Essay: The Impact of AI on Education",
    subject: "English Language",
    dueDate: "Submitted Oct 12",
    maxScore: 30,
    score: 28,
    status: "GRADED",
    instructions: "Write a 500-word expository essay arguing the advantages and ethics of AI tools for junior high learners.",
    teacherRemarks: "Well-structured essay with excellent thesis and rich vocabulary. Excellent arguments!",
  },
  {
    id: "asg-4",
    title: "Ghanaian Pre-Colonial Trade Routes Map",
    subject: "Social Studies",
    dueDate: "Submitted Oct 14",
    maxScore: 25,
    status: "SUBMITTED",
    instructions: "Draw and label the trans-Saharan trade commodities connecting ancient Ghana to the coast.",
  },
  {
    id: "asg-5",
    title: "HTML5 & CSS Personal Portfolio Skeleton",
    subject: "Information Technology",
    dueDate: "Submitted Oct 8",
    maxScore: 20,
    score: 20,
    status: "GRADED",
    instructions: "Build a semantic two-column HTML5 web page styling your bio and favorite hobbies.",
    teacherRemarks: "Clean HTML structure and beautiful use of CSS flexbox. 100% full marks!",
  },
];

export function StudentAssignmentsView() {
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "SUBMITTED" | "GRADED">("ALL");
  const [assignments, setAssignments] = useState<StudentAssignment[]>(mockAssignments);
  const [activeAssignmentToSubmit, setActiveAssignmentToSubmit] = useState<StudentAssignment | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignmentToSubmit) return;

    setAssignments((prev) =>
      prev.map((a) =>
        a.id === activeAssignmentToSubmit.id
          ? { ...a, status: "SUBMITTED" }
          : a,
      ),
    );

    setNotice(`Assignment "${activeAssignmentToSubmit.title}" submitted successfully!`);
    setTimeout(() => setNotice(null), 4000);
    setActiveAssignmentToSubmit(null);
    setSubmissionNotes("");
  };

  const filtered = assignments.filter((a) => {
    if (filter === "PENDING") return a.status === "PENDING";
    if (filter === "SUBMITTED") return a.status === "SUBMITTED";
    if (filter === "GRADED") return a.status === "GRADED";
    return true;
  });

  const pendingCount = assignments.filter((a) => a.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Assignments & Coursework</h2>
          <p className="text-xs text-slate-500">
            Submit homework tasks, upload lab write-ups, and review teacher scores
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-slate-800 dark:bg-slate-900">
          {(["ALL", "PENDING", "SUBMITTED", "GRADED"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={cn(
                "rounded-lg px-3 py-1 font-bold transition",
                filter === mode
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300",
              )}
            >
              {mode === "ALL"
                ? "All Tasks"
                : mode === "PENDING"
                  ? `Pending (${pendingCount})`
                  : mode === "SUBMITTED"
                    ? "Submitted"
                    : "Graded"}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {/* Grid of Assignments */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((asg) => (
          <div
            key={asg.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {asg.subject}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    asg.status === "GRADED" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                    asg.status === "SUBMITTED" && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                    asg.status === "PENDING" && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                  )}
                >
                  {asg.status}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{asg.title}</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{asg.instructions}</p>

              {asg.teacherRemarks && (
                <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Teacher Remarks: </span>
                  {asg.teacherRemarks}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400">{asg.dueDate}</span>

              {asg.status === "PENDING" ? (
                <button
                  onClick={() => setActiveAssignmentToSubmit(asg)}
                  className="rounded-xl bg-indigo-600 px-3.5 py-1.5 font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  Submit Solution →
                </button>
              ) : asg.status === "GRADED" ? (
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  {asg.score} / {asg.maxScore} marks
                </span>
              ) : (
                <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                  <Check className="size-3.5" /> Awaiting Teacher Review
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Submission Modal */}
      <PortalModal
        isOpen={!!activeAssignmentToSubmit}
        onClose={() => setActiveAssignmentToSubmit(null)}
        title={activeAssignmentToSubmit ? `Submit: ${activeAssignmentToSubmit.title}` : "Submit Assignment"}
        description={`Course: ${activeAssignmentToSubmit?.subject}`}
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Assignment Instructions
            </label>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {activeAssignmentToSubmit?.instructions}
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-6 text-center dark:border-indigo-800 dark:bg-indigo-950/20">
            <Upload className="mx-auto size-8 text-indigo-600" />
            <p className="mt-2 font-bold text-slate-800 dark:text-slate-200">
              Upload assignment PDF or Doc file
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Drag and drop file here, or click to browse
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Student Submission Notes
            </label>
            <textarea
              rows={3}
              placeholder="Add any comments or notes for your teacher..."
              value={submissionNotes}
              onChange={(e) => setSubmissionNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveAssignmentToSubmit(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Confirm Submission
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
