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
          <h2 className="text-xl font-black text-foreground">Assignments & Coursework</h2>
          <p className="text-xs text-muted-foreground">
            Submit homework tasks, upload lab write-ups, and review teacher scores
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-border bg-card p-1 text-xs">
          {(["ALL", "PENDING", "SUBMITTED", "GRADED"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={cn(
                "rounded-lg px-3 py-1 font-bold transition",
                filter === mode
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
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
        <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-xs font-semibold text-success">
          <Check className="size-4 text-success" />
          {notice}
        </div>
      )}

      {/* Grid of Assignments */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((asg) => (
          <div
            key={asg.id}
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                  {asg.subject}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    asg.status === "GRADED" && "bg-success/10 text-success",
                    asg.status === "SUBMITTED" && "bg-primary/10 text-primary",
                    asg.status === "PENDING" && "bg-warning/10 text-warning",
                  )}
                >
                  {asg.status}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-bold text-foreground">{asg.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{asg.instructions}</p>

              {asg.teacherRemarks && (
                <div className="mt-3 rounded-xl bg-muted/50 p-2.5 text-[11px] text-foreground/80">
                  <span className="font-bold text-primary">Teacher Remarks: </span>
                  {asg.teacherRemarks}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-[11px] font-semibold text-muted-foreground/70">{asg.dueDate}</span>

              {asg.status === "PENDING" ? (
                <button
                  onClick={() => setActiveAssignmentToSubmit(asg)}
                  className="rounded-xl bg-primary px-3.5 py-1.5 font-bold text-primary-foreground shadow-xs hover:bg-primary/90"
                >
                  Submit Solution →
                </button>
              ) : asg.status === "GRADED" ? (
                <span className="font-black text-success">
                  {asg.score} / {asg.maxScore} marks
                </span>
              ) : (
                <span className="flex items-center gap-1 font-semibold text-primary">
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Assignment Instructions
            </label>
            <p className="mt-1 text-muted-foreground">
              {activeAssignmentToSubmit?.instructions}
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-primary/20 bg-primary/10 p-6 text-center">
            <Upload className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-bold text-foreground">
              Upload assignment PDF or Doc file
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Drag and drop file here, or click to browse
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Student Submission Notes
            </label>
            <textarea
              rows={3}
              placeholder="Add any comments or notes for your teacher..."
              value={submissionNotes}
              onChange={(e) => setSubmissionNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border p-2 text-xs outline-none focus:border-primary dark:bg-muted dark:text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setActiveAssignmentToSubmit(null)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              Confirm Submission
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  );
}
