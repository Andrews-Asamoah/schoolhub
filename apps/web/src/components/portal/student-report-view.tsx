import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Download, FileText, Printer, School, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { DataTable } from "@/components/ui/data-table";
import { useCanExportTables } from "@/lib/table-export-policy";

interface SubjectScoreRow {
  code: string;
  name: string;
  cw: number;
  ex: number;
  tot: number;
  gr: string;
  rk: string;
  rm: string;
}

const mockReportScores: SubjectScoreRow[] = [
  { code: "SCI-09", name: "Integrated Science", cw: 28, ex: 61, tot: 89, gr: "A1", rk: "#1", rm: "Outstanding grasp of scientific methods and concepts." },
  { code: "MTH-09", name: "Core Mathematics", cw: 26, ex: 59, tot: 85, gr: "A1", rk: "#2", rm: "Excellent computational and logical problem solving." },
  { code: "ENG-09", name: "English Language", cw: 25, ex: 56, tot: 81, gr: "A1", rk: "#4", rm: "Strong vocabulary, eloquence, and essay construction." },
  { code: "SOC-09", name: "Social Studies", cw: 24, ex: 54, tot: 78, gr: "B2", rk: "#5", rm: "Commendable historical analysis and engagement." },
  { code: "ICT-09", name: "Information Technology", cw: 29, ex: 64, tot: 93, gr: "A1", rk: "#1", rm: "Exceptional computing agility and practical performance." },
  { code: "FRN-09", name: "French Language", cw: 21, ex: 48, tot: 69, gr: "C4", rk: "#8", rm: "Good effort; more conversational drills recommended." },
  { code: "RME-09", name: "Religious & Moral Education", cw: 27, ex: 58, tot: 85, gr: "A1", rk: "#3", rm: "High moral reasoning and thoughtful participation." },
  { code: "PHE-09", name: "Physical & Health Education", cw: 28, ex: 62, tot: 90, gr: "A1", rk: "#2", rm: "Great sportsmanship and physical endurance." },
];

export function StudentReportView() {
  const canExport = useCanExportTables();
  const [selectedTerm, setSelectedTerm] = useState("Term 1 (Current)");

  const { data, isLoading } = useQuery({
    queryKey: ["assessments", "me", "report"],
    queryFn: () => apiFetch<any>("/assessments/me/report"),
    retry: false,
  });

  const scores: SubjectScoreRow[] = mockReportScores;
  const gpa = "3.92 / 4.00";
  const classRank = "#1 of 38";
  const attendanceRate = "97.4%";

  return (
    <div className="space-y-6">
      {/* Header & Print Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Academic Report Card</h2>
          <p className="text-xs text-slate-500">
            Official terminal assessment scores, subject grades, and teacher remarks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="Term 1 (Current)">2025/2026 • Term 1 (Current)</option>
            <option value="Term 3 (2024/2025)">2024/2025 • Term 3</option>
            <option value="Term 2 (2024/2025)">2024/2025 • Term 2</option>
          </select>

          <button
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <Printer className="size-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-xs dark:border-indigo-900/30 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300">Grade Point Average</span>
            <Award className="size-5 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{gpa}</p>
          <p className="mt-0.5 text-xs font-semibold text-emerald-600">Grade A1 • Distinction</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Class Position</span>
            <TrendingUp className="size-5 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{classRank}</p>
          <p className="mt-0.5 text-xs text-slate-400">JHS 3 Emerald Class Roster</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Term Attendance</span>
            <CheckCircle2 className="size-5 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{attendanceRate}</p>
          <p className="mt-0.5 text-xs text-slate-400">Regular & Punctual</p>
        </div>
      </div>

      {/* Subject Scores Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="size-4 text-indigo-600" />
            Subject Breakdown & Marks
          </h3>
        </div>

        <DataTable
          rows={scores}
          canExport={canExport}
          exportTitle="Term 1 Academic Report"
          getRowId={(row) => row.code}
          emptyTitle="No results published yet"
          emptyDescription="Scores will appear once grading is finalized."
          columns={[
            {
              id: "subject",
              header: "Subject",
              cell: (row) => (
                <div>
                  <p className="font-bold text-foreground">{row.name}</p>
                  <p className="text-[10px] text-muted-foreground">{row.code}</p>
                </div>
              ),
            },
            {
              id: "cw",
              header: "Classwork (30)",
              className: "text-center",
              value: (row) => row.cw,
              cell: (row) => <span className="font-medium">{row.cw}</span>,
            },
            {
              id: "ex",
              header: "Exams (70)",
              className: "text-center",
              value: (row) => row.ex,
              cell: (row) => <span className="font-medium">{row.ex}</span>,
            },
            {
              id: "tot",
              header: "Total Score (100)",
              className: "text-center",
              value: (row) => row.tot,
              cell: (row) => <span className="font-black text-foreground">{row.tot}%</span>,
            },
            {
              id: "gr",
              header: "Grade",
              className: "text-center",
              value: (row) => row.gr,
              cell: (row) => (
                <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {row.gr}
                </span>
              ),
            },
            {
              id: "rk",
              header: "Rank",
              className: "text-center",
              value: (row) => Number(row.rk.replace("#", "")),
              cell: (row) => <span className="font-bold text-slate-600 dark:text-slate-300">{row.rk}</span>,
            },
            {
              id: "rm",
              header: "Teacher's Remark",
              cell: (row) => <span className="text-xs leading-relaxed">{row.rm}</span>,
            },
          ]}
        />
      </div>

      {/* Conduct & Teacher Remarks */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Class Teacher&apos;s Appraisal
          </h4>
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            &ldquo;Kwame continues to exhibit stellar intellectual curiosity and model leadership as class prefect. He collaborates warmly with his peers and approaches every project with thorough preparation.&rdquo;
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
            <span>Mrs. Grace Appiah</span>
            <span className="font-semibold text-indigo-600">Class Teacher</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Headmistress&apos;s Endorsement
          </h4>
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            &ldquo;An exemplary scholar whose consistency is an inspiration to the entire student body. Recommended for honors distinction in science and mathematics.&rdquo;
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
            <span>Dr. Elizabeth Ansah</span>
            <span className="font-semibold text-emerald-600">Headmistress</span>
          </div>
        </div>
      </div>
    </div>
  );
}
