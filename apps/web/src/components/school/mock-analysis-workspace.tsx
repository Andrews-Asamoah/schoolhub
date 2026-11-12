import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";

type Status = "ON_TRACK" | "WATCH" | "AT_RISK";
type Trend = "IMPROVING" | "STEADY" | "DECLINING" | "NEW";
interface Options { years: { id: string; name: string; isCurrent: boolean }[]; classes: { id: string; name: string; academicYearId: string | null; yearIds: string[] }[] }
interface Mock { id: string; name: string; sequence: number | null; sat: number; classAverage: number | null; highest: number | null; lowest: number | null; atRisk: number }
interface SubjectRow { subjectId: string; name: string; points: { mockId: string; average: number | null; sat: number; delta: number | null }[] }
interface StudentRow {
  id: string; name: string; admissionNumber: string; latestAverage: number | null; mocksSat: number; status: Status | null; change: number | null; trend: Trend;
  series: { mockId: string; average: number | null; position: number | null; subjects: { subjectId: string; percentage: number; grade: string | null }[] }[];
}
interface Analysis {
  year: { name: string }; class: { name: string }; includeDrafts: boolean; subjectsLimited: boolean; gradingScales: string[];
  mocks: Mock[]; subjects: SubjectRow[]; grades: string[]; gradeDistribution: { mockId: string; counts: Record<string, number> }[]; students: StudentRow[];
  thresholds: { onTrack: number; watch: number; trendDelta: number };
}

const field = "rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";
const tooltipStyle = { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)", fontSize: 12 };
const tick = { fill: "var(--muted-foreground)", fontSize: 11 };
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const STATUS_LABEL: Record<Status, string> = { ON_TRACK: "On track", WATCH: "Watch", AT_RISK: "At risk" };
const STATUS_STYLE: Record<Status, string> = {
  ON_TRACK: "bg-success/10 text-success",
  WATCH: "bg-warning/10 text-warning",
  AT_RISK: "bg-destructive/10 text-destructive",
};
const STATUS_ORDER: Record<string, number> = { AT_RISK: 0, WATCH: 1, ON_TRACK: 2 };
const fmt = (value: number | null) => (value == null ? "—" : value.toFixed(1));

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {note && <p className="mb-3 mt-1 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight;
  const tone = value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return <span className={`ml-1 inline-flex items-center text-[11px] font-semibold ${tone}`}><Icon className="size-3" />{Math.abs(value).toFixed(1)}</span>;
}

function TrendBadge({ trend, change }: { trend: Trend; change: number | null }) {
  if (trend === "NEW") return <span className="text-xs text-muted-foreground">First mock</span>;
  const label = trend === "IMPROVING" ? "Improving" : trend === "DECLINING" ? "Declining" : "Steady";
  return <span className="inline-flex items-center text-xs font-semibold">{label}<Delta value={change} /></span>;
}

export function MockAnalysisWorkspace() {
  const options = useQuery({ queryKey: ["mock-analytics", "options"], queryFn: () => apiFetch<Options>("/mock-analytics/options") });
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [subjectId, setSubjectId] = useState("ALL");
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!options.data || yearId) return;
    setYearId((options.data.years.find((y) => y.isCurrent) ?? options.data.years[0])?.id ?? "");
  }, [options.data, yearId]);
  const classes = useMemo(() => (options.data?.classes ?? []).filter((c) => c.yearIds.includes(yearId)), [options.data, yearId]);
  useEffect(() => {
    if (classes.length && !classes.some((c) => c.id === classId)) setClassId(classes[0]!.id);
    if (!classes.length) setClassId("");
  }, [classes, classId]);

  const analysis = useQuery({
    queryKey: ["mock-analytics", yearId, classId, includeDrafts],
    enabled: !!yearId && !!classId,
    queryFn: () => apiFetch<Analysis>(`/mock-analytics?academicYearId=${encodeURIComponent(yearId)}&classId=${encodeURIComponent(classId)}&includeDrafts=${includeDrafts}`),
  });
  const data = analysis.data;
  useEffect(() => { setStudentId(null); setSubjectId("ALL"); }, [yearId, classId]);

  const trendData = useMemo(() => {
    if (!data) return [];
    return data.mocks.map((mock) => {
      const subject = data.subjects.find((s) => s.subjectId === subjectId)?.points.find((p) => p.mockId === mock.id);
      return { name: mock.name, "Class average": subjectId === "ALL" ? mock.classAverage : subject?.average ?? null, Highest: subjectId === "ALL" ? mock.highest : null, Lowest: subjectId === "ALL" ? mock.lowest : null };
    });
  }, [data, subjectId]);
  const gradeData = useMemo(() => data?.mocks.map((mock) => ({ name: mock.name, ...(data.gradeDistribution.find((g) => g.mockId === mock.id)?.counts ?? {}) })) ?? [], [data]);
  const students = useMemo(() => [...(data?.students ?? [])].sort((a, b) => (STATUS_ORDER[a.status ?? ""] ?? 3) - (STATUS_ORDER[b.status ?? ""] ?? 3) || a.name.localeCompare(b.name)), [data]);
  const selected = data?.students.find((s) => s.id === studentId) ?? null;

  if (options.isLoading) return <p className="text-sm text-muted-foreground">Loading mock analysis…</p>;
  // Show a real failure instead of the "no mock exams" message, which would hide the cause.
  if (options.isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold text-destructive">Mock analysis could not be loaded.</p>
        <p className="mt-1 text-xs text-muted-foreground">{(options.error as Error).message}</p>
        <button type="button" onClick={() => void options.refetch()} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Try again</button>
      </div>
    );
  }
  if (!options.data?.years.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <BarChart3 className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">No mock exams yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Create one under Assessments: choose "Mock exam", the academic year and the class (for example JHS 3).</p>
      </div>
    );
  }

  const latest = data?.mocks.filter((m) => m.classAverage != null).slice(-2) ?? [];
  const latestMock = latest[latest.length - 1];
  const change = latest.length === 2 ? Math.round((latest[1]!.classAverage! - latest[0]!.classAverage!) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted-foreground">Academic year
          <select className={`${field} mt-1 block`} value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {options.data.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted-foreground">Class
          <select className={`${field} mt-1 block`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          Include marks not yet submitted
        </label>
      </div>

      {analysis.isLoading && <p className="text-sm text-muted-foreground">Analysing…</p>}
      {analysis.isError && <p className="text-sm text-destructive">{(analysis.error as Error).message}</p>}
      {data && !data.mocks.length && <p className="text-sm text-muted-foreground">This class has no mock exams in {data.year.name}.</p>}

      {data && data.mocks.length > 0 && (
        <>
          {data.subjectsLimited && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">Showing only the subjects you teach in this class.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Mocks held", String(data.mocks.length), data.gradingScales.join(", ")],
              ["Latest class average", latestMock ? `${fmt(latestMock.classAverage)}%` : "—", latestMock?.name ?? ""],
              ["Change vs previous", change == null ? "—" : `${change > 0 ? "+" : ""}${change}`, "percentage points"],
              ["Pupils at risk", String(students.filter((s) => s.status === "AT_RISK").length), `latest average below ${data.thresholds.watch}%`],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
                <p className="text-[11px] text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Performance across mocks" note="Average percentage of pupils who sat each mock. Pupils who missed a mock are left out, never counted as zero.">
              <select className={`${field} mb-3`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
                <option value="ALL">All subjects</option>
                {data.subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
              </select>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={tick} /><YAxis domain={[0, 100]} tick={tick} />
                    <Tooltip contentStyle={tooltipStyle} /><Legend />
                    <Line type="monotone" dataKey="Class average" stroke={COLORS[0]} strokeWidth={2.5} connectNulls />
                    {subjectId === "ALL" && <Line type="monotone" dataKey="Highest" stroke={COLORS[1]} strokeDasharray="4 4" connectNulls />}
                    {subjectId === "ALL" && <Line type="monotone" dataKey="Lowest" stroke={COLORS[3]} strokeDasharray="4 4" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Grade distribution" note="Number of subject results at each grade, per mock. Lower stanine is better.">
              {data.grades.length === 0 ? <p className="text-xs text-muted-foreground">No grades yet.</p> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gradeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={tick} /><YAxis allowDecimals={false} tick={tick} />
                      <Tooltip contentStyle={tooltipStyle} /><Legend />
                      {data.grades.map((grade, index) => <Bar key={grade} dataKey={grade} name={`Grade ${grade}`} stackId="g" fill={`hsl(${150 - (index / Math.max(1, data.grades.length - 1)) * 150} 65% 48%)`} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Subjects across mocks" note="Average percentage per subject. Arrows compare with the previous mock the subject was written.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Subject</th>{data.mocks.map((m) => <th key={m.id} className="py-2 pr-4">{m.name}</th>)}</tr></thead>
                <tbody>{data.subjects.map((subject) => (
                  <tr key={subject.subjectId} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-medium">{subject.name}</td>
                    {subject.points.map((p) => <td key={p.mockId} className="py-2 pr-4 tabular-nums">{fmt(p.average)}<Delta value={p.delta} /></td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Pupils" note={`On track: latest average ${data.thresholds.onTrack}% or more. Watch: ${data.thresholds.watch}–${data.thresholds.onTrack - 0.1}%. At risk: below ${data.thresholds.watch}%. A move of ${data.thresholds.trendDelta} points or more counts as a trend. Select a pupil for detail.`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Pupil</th>{data.mocks.map((m) => <th key={m.id} className="py-2 pr-4">{m.name}</th>)}<th className="py-2 pr-4">Trend</th><th className="py-2">Status</th>
                </tr></thead>
                <tbody>{students.map((student) => (
                  <tr key={student.id} onClick={() => setStudentId(student.id === studentId ? null : student.id)} className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${student.id === studentId ? "bg-muted/50" : ""}`}>
                    <td className="py-2 pr-4 font-medium">{student.name}</td>
                    {student.series.map((p) => <td key={p.mockId} className="py-2 pr-4 tabular-nums">{fmt(p.average)}{p.position != null && <span className="ml-1 text-[11px] text-muted-foreground">#{p.position}</span>}</td>)}
                    <td className="py-2 pr-4">{student.mocksSat ? <TrendBadge trend={student.trend} change={student.change} /> : <span className="text-xs text-muted-foreground">Not sat</span>}</td>
                    <td className="py-2">{student.status ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[student.status]}`}>{STATUS_LABEL[student.status]}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>

          {selected && <StudentDetail student={selected} data={data} />}
        </>
      )}
    </div>
  );
}

function StudentDetail({ student, data }: { student: StudentRow; data: Analysis }) {
  const chart = data.mocks.map((mock) => ({
    name: mock.name,
    [student.name]: student.series.find((p) => p.mockId === mock.id)?.average ?? null,
    "Class average": mock.classAverage,
  }));
  return (
    <Panel title={`${student.name} against the class`} note="The solid line is the pupil's average per mock; the dashed line is the class average.">
      {student.status === "AT_RISK" && <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-destructive"><TriangleAlert className="size-4" />Latest average is below {data.thresholds.watch}%.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={tick} /><YAxis domain={[0, 100]} tick={tick} />
              <Tooltip contentStyle={tooltipStyle} /><Legend />
              <Line type="monotone" dataKey={student.name} stroke={COLORS[0]} strokeWidth={2.5} connectNulls />
              <Line type="monotone" dataKey="Class average" stroke={COLORS[2]} strokeDasharray="4 4" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Subject</th>{data.mocks.map((m) => <th key={m.id} className="py-2 pr-3">{m.name}</th>)}</tr></thead>
            <tbody>{data.subjects.map((subject) => (
              <tr key={subject.subjectId} className="border-b border-border/60">
                <td className="py-1.5 pr-3">{subject.name}</td>
                {student.series.map((p) => {
                  const row = p.subjects.find((s) => s.subjectId === subject.subjectId);
                  const avg = subject.points.find((pt) => pt.mockId === p.mockId)?.average ?? null;
                  const below = row && avg != null && row.percentage < avg;
                  return <td key={p.mockId} className={`py-1.5 pr-3 tabular-nums ${below ? "text-destructive" : ""}`}>{row ? `${row.percentage.toFixed(1)}${row.grade ? ` (${row.grade})` : ""}` : "—"}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">Red means below the class average for that subject and mock. Grade in brackets.</p>
        </div>
      </div>
    </Panel>
  );
}
