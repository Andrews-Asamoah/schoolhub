import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import {
  saveAdmissionCycleSchema,
  type ApplicationStatus,
  type IssuedCredentials,
} from "@schoolhub/shared";
import { CredentialsDialog, type CredentialEntry } from "@/components/credentials/credentials-dialog";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { WorkspaceEmptyState } from "@/components/school/workspace-ui";
import { apiFetch } from "@/lib/api";
import { getTenantSubdomain, useTenantSchool } from "@/lib/tenant";

interface ClassOption {
  id: string;
  name: string;
  level?: string;
  isActive: boolean;
}
interface YearOption {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: { id: string; name: string; isCurrent: boolean }[];
}
type FeeStatus = "NOT_REQUIRED" | "PENDING" | "PAID" | "EXEMPTED";
interface FeeSummary {
  collected: number;
  collectedCount: number;
  pending: number;
  pendingCount: number;
  exemptedCount: number;
  waived: number;
}

/** Money in the school's currency (GHS by default). */
function useMoney() {
  const { school } = useTenantSchool();
  const currency = school?.currency || "GHS";
  return (value: number | string) =>
    new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(Number(value));
}

interface Cycle {
  id: string;
  name: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  opensAt: string;
  closesAt: string;
  passMark: string;
  examMaxScore: string;
  admissionFee: string;
  instructions: string | null;
  academicYearId: string;
  termId: string | null;
  academicYear: { id: string; name: string };
  term: { id: string; name: string } | null;
  classes: { classId: string; seats: number | null; class: { id: string; name: string } }[];
  applicationCounts: Record<string, number>;
}
interface Application {
  id: string;
  applicationNumber: string;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  previousSchool: string | null;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianRelationship: string;
  examDate: string | null;
  examVenue: string | null;
  examScore: string | null;
  decisionNote: string | null;
  feeStatus: FeeStatus;
  feeDue: string;
  feePaidAmount: string | null;
  feeReceiptNumber: string | null;
  feeExemptionReason: string | null;
  class: { id: string; name: string };
  cycle: { id: string; name: string; passMark: string; examMaxScore: string };
}
interface ApplicationPage {
  data: Application[];
  meta: { total: number; page: number; totalPages: number };
}

const input =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
const btn =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const ghost = `${btn} border border-border text-foreground hover:bg-muted`;

const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  UNDER_REVIEW: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  EXAM_SCHEDULED: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  EXAM_COMPLETED: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ACCEPTED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  WAITLISTED: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  REJECTED: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  ADMITTED: "bg-green-600/15 text-green-700 dark:text-green-300",
  WITHDRAWN: "bg-slate-500/10 text-slate-500",
  NOT_REQUIRED: "bg-slate-500/10 text-slate-500",
  PENDING_FEE: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PAID: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  EXEMPTED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  DRAFT: "bg-slate-500/10 text-slate-600",
  OPEN: "bg-emerald-500/10 text-emerald-700",
  CLOSED: "bg-rose-500/10 text-rose-700",
};
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[value] ?? ""}`}>
      {label(value)}
    </span>
  );
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function AdmissionsWorkspace() {
  const [tab, setTab] = useState<"applications" | "intakes">("applications");
  const { activeRole } = useSchoolRole();
  const canDecide = activeRole === "owner" || activeRole === "admin";
  const subdomain = getTenantSubdomain();
  const cyclesQuery = useQuery({
    queryKey: ["admissions", "cycles"],
    queryFn: () => apiFetch<Cycle[]>("/admissions/cycles"),
    retry: false,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["applications", "intakes"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {key === "applications" ? "Applications" : "Intakes"}
            </button>
          ))}
        </div>
        {subdomain && (
          <p className="text-xs text-muted-foreground">
            Public enrollment form:{" "}
            <a className="font-semibold text-primary underline" href={`/apply${window.location.search}`} target="_blank" rel="noreferrer">
              {window.location.origin}/apply
            </a>
          </p>
        )}
      </div>
      {cyclesQuery.error ? (
        <WorkspaceEmptyState title="Could not load admissions" description={errorText(cyclesQuery.error)} />
      ) : tab === "intakes" ? (
        <IntakesPanel cycles={cyclesQuery.data ?? []} canEdit={canDecide} />
      ) : (
        <ApplicationsPanel cycles={cyclesQuery.data ?? []} canDecide={canDecide} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ intakes

function IntakesPanel({ cycles, canEdit }: { cycles: Cycle[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Cycle | "new" | null>(null);
  const money = useMoney();
  return (
    <div className="space-y-4">
      {canEdit && !editing && (
        <button type="button" className={primary} onClick={() => setEditing("new")}>
          Open a new intake
        </button>
      )}
      {editing && <IntakeForm cycle={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      {cycles.length === 0 && !editing ? (
        <WorkspaceEmptyState
          title="No intakes yet"
          description="An intake is the enrollment window a school opens each term or year. Create one, choose the classes that are admitting, then open it to start receiving applications."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cycles.map((cycle) => {
            const total = Object.values(cycle.applicationCounts).reduce((a, b) => a + b, 0);
            return (
              <article key={cycle.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{cycle.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cycle.academicYear.name}
                      {cycle.term ? ` · ${cycle.term.name}` : ""} · {cycle.opensAt.slice(0, 10)} to {cycle.closesAt.slice(0, 10)}
                    </p>
                  </div>
                  <Badge value={cycle.status} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Pass mark {Number(cycle.passMark)}/{Number(cycle.examMaxScore)} · Exam fee{" "}
                  {Number(cycle.admissionFee) > 0 ? `${money(cycle.admissionFee)} (cash)` : "none"} · {total} application{total === 1 ? "" : "s"}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {cycle.classes.map((row) => (
                    <li key={row.classId} className="rounded-md bg-muted px-2 py-1 text-[11px] text-foreground">
                      {row.class.name}
                      {row.seats ? ` · ${row.seats} seats` : ""}
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <button type="button" className={`${ghost} mt-3`} onClick={() => setEditing(cycle)}>
                    Edit intake
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IntakeForm({ cycle, onDone }: { cycle: Cycle | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const classesQuery = useQuery({
    queryKey: ["academics", "classes"],
    queryFn: () => apiFetch<ClassOption[]>("/academics/classes"),
  });
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<YearOption[]>("/schools/academic-years"),
  });
  const [name, setName] = useState(cycle?.name ?? "");
  const [academicYearId, setAcademicYearId] = useState(cycle?.academicYearId ?? "");
  const [termId, setTermId] = useState(cycle?.termId ?? "");
  const [opensAt, setOpensAt] = useState(cycle?.opensAt.slice(0, 10) ?? "");
  const [closesAt, setClosesAt] = useState(cycle?.closesAt.slice(0, 10) ?? "");
  const [status, setStatus] = useState<Cycle["status"]>(cycle?.status ?? "DRAFT");
  const [examMaxScore, setExamMaxScore] = useState(String(Number(cycle?.examMaxScore ?? 100)));
  const [passMark, setPassMark] = useState(String(Number(cycle?.passMark ?? 50)));
  const [admissionFee, setAdmissionFee] = useState(String(Number(cycle?.admissionFee ?? 0)));
  const [instructions, setInstructions] = useState(cycle?.instructions ?? "");
  const [seats, setSeats] = useState<Record<string, string>>(
    Object.fromEntries((cycle?.classes ?? []).map((c) => [c.classId, c.seats ? String(c.seats) : ""])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set((cycle?.classes ?? []).map((c) => c.classId)));
  const [formError, setFormError] = useState<string | null>(null);
  const years = yearsQuery.data ?? [];
  const terms = years.find((y) => y.id === academicYearId)?.terms ?? [];

  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch(cycle ? `/admissions/cycles/${cycle.id}` : "/admissions/cycles", {
        method: cycle ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admissions"] });
      onDone();
    },
  });

  function submit() {
    setFormError(null);
    const parsed = saveAdmissionCycleSchema.safeParse({
      name,
      academicYearId,
      termId,
      opensAt,
      closesAt,
      status,
      examMaxScore: Number(examMaxScore),
      passMark: Number(passMark),
      admissionFee: Number(admissionFee || 0),
      instructions: instructions || undefined,
      classes: [...selected].map((classId) => ({ classId, seats: seats[classId] ? Number(seats[classId]) : null })),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-bold text-foreground">{cycle ? "Edit intake" : "New intake"}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold sm:col-span-2">
          Intake name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="2027/2028 Term 1 Intake" />
        </label>
        <label className="text-xs font-semibold">
          Academic year
          <select className={input} value={academicYearId} onChange={(e) => { setAcademicYearId(e.target.value); setTermId(""); }}>
            <option value="">Choose…</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Term students join (optional)
          <select className={input} value={termId} onChange={(e) => setTermId(e.target.value)} disabled={!academicYearId}>
            <option value="">Current term at admission</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Applications open
          <input type="date" className={input} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">
          Applications close
          <input type="date" className={input} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">
          Exam maximum score
          <input type="number" min={1} className={input} value={examMaxScore} onChange={(e) => setExamMaxScore(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">
          Pass mark
          <input type="number" min={0} className={input} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
        </label>
        <label className="text-xs font-semibold sm:col-span-2">
          Admission (entrance exam) fee per applicant, paid in cash on exam day
          <input type="number" min={0} step="0.01" className={input} value={admissionFee} onChange={(e) => setAdmissionFee(e.target.value)} />
          <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
            Counts as school income and is not refundable, whether or not the applicant is admitted. Use 0 for no fee.
          </span>
        </label>
        <label className="text-xs font-semibold">
          Status
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as Cycle["status"])}>
            <option value="DRAFT">Draft (not public)</option>
            <option value="OPEN">Open (accepting applications)</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <label className="text-xs font-semibold sm:col-span-2">
          Instructions shown on the form (documents to bring, exam details…)
          <textarea className={`${input} h-24 py-2`} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-foreground">Classes admitting students (seats optional)</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(classesQuery.data ?? []).filter((c) => c.isActive).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <input
                id={`cls-${c.id}`}
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(c.id); else next.delete(c.id);
                  setSelected(next);
                }}
              />
              <label htmlFor={`cls-${c.id}`} className="flex-1 text-sm">{c.name}</label>
              <input
                type="number"
                min={1}
                placeholder="Seats"
                disabled={!selected.has(c.id)}
                value={seats[c.id] ?? ""}
                onChange={(e) => setSeats({ ...seats, [c.id]: e.target.value })}
                className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs"
              />
            </div>
          ))}
        </div>
      </fieldset>
      {(formError || save.error) && (
        <p role="alert" className="mt-3 text-xs text-rose-600">{formError ?? errorText(save.error)}</p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" className={primary} onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save intake"}
        </button>
        <button type="button" className={ghost} onClick={onDone}>Cancel</button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- applications

function ApplicationsPanel({ cycles, canDecide }: { cycles: Cycle[]; canDecide: boolean }) {
  const queryClient = useQueryClient();
  const [cycleId, setCycleId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<CredentialEntry[]>([]);
  const [examDate, setExamDate] = useState("");
  const [venue, setVenue] = useState("");
  const [deciding, setDeciding] = useState<{ app: Application; decision: "ACCEPTED" | "WAITLISTED" | "REJECTED" } | null>(null);
  const [feeStatus, setFeeStatus] = useState("");
  const [receiving, setReceiving] = useState<Application | null>(null);
  const [exempting, setExempting] = useState<Application | null>(null);
  const [receipt, setReceipt] = useState<{ receiptNumber: string; amount: string; name: string } | null>(null);
  const { activeRole } = useSchoolRole();
  const money = useMoney();
  const canCollect = ["owner", "admin", "staff", "accountant"].includes(activeRole ?? "");
  const canEditExam = ["owner", "admin", "staff"].includes(activeRole ?? "");
  const summaryQuery = useQuery({
    queryKey: ["admissions", "fees", cycleId],
    queryFn: () => apiFetch<FeeSummary>(`/admissions/fees/summary${cycleId ? `?cycleId=${cycleId}` : ""}`),
    retry: false,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => apiFetch(`/admissions/applications/${id}/fee/exemption`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admissions"] }),
  });

  const query = useQuery({
    queryKey: ["admissions", "applications", { cycleId, status, feeStatus, search }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (cycleId) params.set("cycleId", cycleId);
      if (status) params.set("status", status);
      if (feeStatus) params.set("feeStatus", feeStatus);
      if (search.trim()) params.set("search", search.trim());
      return apiFetch<ApplicationPage>(`/admissions/applications?${params}`);
    },
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admissions"] });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiFetch<any>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: refresh,
  });

  function admit(app: Application) {
    act.mutate(
      { path: `/admissions/applications/${app.id}/admit` },
      {
        onSuccess: (result) => {
          const student = result.student;
          const name = `${app.firstName} ${app.lastName}`;
          const entries: CredentialEntry[] = [];
          if (student.credentials) entries.push({ label: `${name} (student)`, credentials: student.credentials as IssuedCredentials });
          for (const g of student.guardianCredentials ?? []) {
            if (g.credentials) entries.push({ label: `${g.name} (guardian of ${name})`, credentials: g.credentials });
          }
          setIssued(entries);
          void queryClient.invalidateQueries({ queryKey: ["students"] });
        },
      },
    );
  }

  const rows = query.data?.data ?? [];
  const schedulable = rows.filter((r) => ["SUBMITTED", "UNDER_REVIEW", "EXAM_SCHEDULED"].includes(r.status));

  return (
    <div className="space-y-4">
      {summaryQuery.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Admission fees collected (cash)</p>
            <p className="mt-1 text-lg font-bold text-foreground">{money(summaryQuery.data.collected)}</p>
            <p className="text-[11px] text-muted-foreground">{summaryQuery.data.collectedCount} paid · non-refundable school income</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Still to collect</p>
            <p className="mt-1 text-lg font-bold text-foreground">{money(summaryQuery.data.pending)}</p>
            <p className="text-[11px] text-muted-foreground">{summaryQuery.data.pendingCount} applicant{summaryQuery.data.pendingCount === 1 ? "" : "s"} unpaid</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Fee exemptions</p>
            <p className="mt-1 text-lg font-bold text-foreground">{summaryQuery.data.exemptedCount}</p>
            <p className="text-[11px] text-muted-foreground">{money(summaryQuery.data.waived)} waived</p>
          </div>
        </div>
      )}
      {receipt && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
          <span>
            Received {money(receipt.amount)} cash from <b>{receipt.name}</b>. Receipt <b>{receipt.receiptNumber}</b> — recorded as school income.
          </span>
          <button type="button" className={ghost} onClick={() => setReceipt(null)}>Dismiss</button>
        </div>
      )}
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        <select className={input} value={cycleId} onChange={(e) => setCycleId(e.target.value)} aria-label="Intake">
          <option value="">All intakes</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {["SUBMITTED", "UNDER_REVIEW", "EXAM_SCHEDULED", "EXAM_COMPLETED", "ACCEPTED", "WAITLISTED", "REJECTED", "ADMITTED"].map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select className={input} value={feeStatus} onChange={(e) => setFeeStatus(e.target.value)} aria-label="Fee status">
          <option value="">Any fee status</option>
          <option value="PENDING">Fee unpaid</option>
          <option value="PAID">Fee paid</option>
          <option value="EXEMPTED">Fee exempted</option>
        </select>
        <input className={input} placeholder="Search name, number or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="text-xs font-semibold">
            Exam date and time
            <input type="datetime-local" className={input} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">
            Venue
            <input className={input} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Main Hall" />
          </label>
          <button
            type="button"
            className={primary}
            disabled={act.isPending || !examDate || venue.trim().length < 2}
            onClick={() =>
              act.mutate(
                { path: "/admissions/applications/schedule-exam", body: { applicationIds: [...picked], examDate, venue } },
                { onSuccess: () => setPicked(new Set()) },
              )
            }
          >
            Schedule exam for {picked.size} applicant{picked.size === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {act.error && <p role="alert" className="text-xs text-rose-600">{errorText(act.error)}</p>}

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading applications…</p>
      ) : rows.length === 0 ? (
        <WorkspaceEmptyState title="No applications" description="Applications appear here as parents submit the public enrollment form." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    aria-label="Select all awaiting exam"
                    checked={schedulable.length > 0 && schedulable.every((r) => picked.has(r.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(schedulable.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th className="p-3">Applicant</th>
                <th className="p-3">Class</th>
                <th className="p-3">Guardian</th>
                <th className="p-3">Status</th>
                <th className="p-3">Admission fee</th>
                <th className="p-3">Exam</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((app) => (
                <tr key={app.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="p-3">
                    {["SUBMITTED", "UNDER_REVIEW", "EXAM_SCHEDULED"].includes(app.status) && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${app.firstName} ${app.lastName}`}
                        checked={picked.has(app.id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(app.id); else next.delete(app.id);
                          setPicked(next);
                        }}
                      />
                    )}
                  </td>
                  <td className="p-3">
                    <p className="font-semibold text-foreground">{app.firstName} {app.lastName}</p>
                    <p className="text-xs text-muted-foreground">{app.applicationNumber} · {app.dateOfBirth.slice(0, 10)}</p>
                  </td>
                  <td className="p-3 text-foreground">{app.class.name}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {app.guardianFirstName} {app.guardianLastName} ({label(app.guardianRelationship)})
                    <br />{app.guardianPhone}{app.guardianEmail ? ` · ${app.guardianEmail}` : ""}
                  </td>
                  <td className="p-3"><Badge value={app.status} /></td>
                  <td className="p-3">
                    <FeeCell
                      app={app}
                      money={money}
                      canCollect={canCollect}
                      canExempt={canDecide}
                      busy={withdraw.isPending}
                      onReceive={() => setReceiving(app)}
                      onExempt={() => setExempting(app)}
                      onWithdraw={() => withdraw.mutate(app.id)}
                    />
                  </td>
                  <td className="min-w-[250px] p-3 align-top text-xs">
                    <ExamCell app={app} canEdit={canEditExam} onSaved={() => void refresh()} />
                  </td>
                  <td className="p-3">
                    <RowActions app={app} canDecide={canDecide} busy={act.isPending} onAct={act.mutate} onDecide={(decision) => setDeciding({ app, decision })} onAdmit={() => admit(app)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {withdraw.error && <p role="alert" className="text-xs text-rose-600">{errorText(withdraw.error)}</p>}
      {receiving && (
        <ReceiveFeeDialog
          app={receiving}
          money={money}
          onClose={() => setReceiving(null)}
          onDone={(r) => {
            setReceipt({ ...r, name: `${receiving.firstName} ${receiving.lastName}` });
            setReceiving(null);
            void refresh();
          }}
        />
      )}
      {exempting && (
        <ExemptFeeDialog
          app={exempting}
          onClose={() => setExempting(null)}
          onDone={() => {
            setExempting(null);
            void refresh();
          }}
        />
      )}
      {deciding && (
        <DecisionDialog
          app={deciding.app}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onSubmit={(body) =>
            act.mutate(
              { path: `/admissions/applications/${deciding.app.id}/decision`, body },
              { onSuccess: () => setDeciding(null) },
            )
          }
          busy={act.isPending}
        />
      )}
      <CredentialsDialog entries={issued} onClose={() => setIssued([])} />
    </div>
  );
}

function RowActions({
  app,
  canDecide,
  busy,
  onAct,
  onDecide,
  onAdmit,
}: {
  app: Application;
  canDecide: boolean;
  busy: boolean;
  onAct: (v: { path: string; body?: unknown }) => void;
  onDecide: (d: "ACCEPTED" | "WAITLISTED" | "REJECTED") => void;
  onAdmit: () => void;
}) {
  const closed = ["ADMITTED", "WITHDRAWN"].includes(app.status);
  return (
    <div className="flex flex-col gap-1.5">
      {app.status === "SUBMITTED" && (
        <button type="button" className={ghost} disabled={busy} onClick={() => onAct({ path: `/admissions/applications/${app.id}/review` })}>
          Start review
        </button>
      )}
      {canDecide && !closed && app.status !== "ACCEPTED" && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={ghost} onClick={() => onDecide("ACCEPTED")}>Accept</button>
          <button type="button" className={ghost} onClick={() => onDecide("WAITLISTED")}>Waitlist</button>
          <button type="button" className={ghost} onClick={() => onDecide("REJECTED")}>Reject</button>
        </div>
      )}
      {canDecide && app.status === "ACCEPTED" && (
        <>
          <button type="button" className={primary} disabled={busy} onClick={onAdmit}>
            Grant admission &amp; create portal
          </button>
          <button type="button" className={ghost} onClick={() => onDecide("REJECTED")}>Withdraw offer</button>
        </>
      )}
      {app.status === "ADMITTED" && <span className="text-xs text-emerald-600">Student record and portal created</span>}
    </div>
  );
}

function DecisionDialog({
  app,
  decision,
  busy,
  onClose,
  onSubmit,
}: {
  app: Application;
  decision: "ACCEPTED" | "WAITLISTED" | "REJECTED";
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { decision: string; note?: string; overridePassMark: boolean }) => void;
}) {
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const score = app.examScore === null ? null : Number(app.examScore);
  const belowPass = decision === "ACCEPTED" && (score === null || score < Number(app.cycle.passMark));
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-sm font-bold text-foreground">
          {label(decision)}: {app.firstName} {app.lastName}
        </h3>
        {belowPass && (
          <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            {score === null ? "No entrance exam score is recorded." : `Score ${score} is below the pass mark of ${Number(app.cycle.passMark)}.`}
            <label className="mt-2 flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Accept anyway (reason required)
            </label>
          </div>
        )}
        <label className="mt-3 block text-xs font-semibold">
          Note {override ? "(required)" : "(optional, shown to the guardian)"}
          <textarea className={`${input} h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={primary}
            disabled={busy || (belowPass && !override) || (override && note.trim().length < 5)}
            onClick={() => onSubmit({ decision, note: note.trim() || undefined, overridePassMark: override })}
          >
            Confirm {label(decision).toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ admission fee

function FeeCell({
  app,
  money,
  canCollect,
  canExempt,
  busy,
  onReceive,
  onExempt,
  onWithdraw,
}: {
  app: Application;
  money: (v: number | string) => string;
  canCollect: boolean;
  canExempt: boolean;
  busy: boolean;
  onReceive: () => void;
  onExempt: () => void;
  onWithdraw: () => void;
}) {
  if (app.feeStatus === "NOT_REQUIRED") return <Badge value="NOT_REQUIRED" />;
  return (
    <div className="flex flex-col gap-1.5">
      {app.feeStatus === "PENDING" && (
        <>
          <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE.PENDING_FEE}`}>
            Unpaid · {money(app.feeDue)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {canCollect && <button type="button" className={primary} onClick={onReceive}>Receive cash</button>}
            {canExempt && <button type="button" className={ghost} onClick={onExempt}>Exempt…</button>}
          </div>
        </>
      )}
      {app.feeStatus === "PAID" && (
        <>
          <Badge value="PAID" />
          <p className="text-[11px] text-muted-foreground">
            {money(app.feePaidAmount ?? app.feeDue)} · {app.feeReceiptNumber}
          </p>
        </>
      )}
      {app.feeStatus === "EXEMPTED" && (
        <>
          <Badge value="EXEMPTED" />
          <p className="max-w-[200px] text-[11px] text-muted-foreground">Reason: {app.feeExemptionReason}</p>
          {canExempt && app.status !== "ADMITTED" && (
            <button type="button" className={ghost} disabled={busy} onClick={onWithdraw}>Withdraw exemption</button>
          )}
        </>
      )}
    </div>
  );
}

function ReceiveFeeDialog({
  app,
  money,
  onClose,
  onDone,
}: {
  app: Application;
  money: (v: number | string) => string;
  onClose: () => void;
  onDone: (receipt: { receiptNumber: string; amount: string }) => void;
}) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const receive = useMutation({
    mutationFn: () =>
      apiFetch<{ receipt: { receiptNumber: string; amount: string } }>(`/admissions/applications/${app.id}/fee/receive`, {
        method: "POST",
        body: JSON.stringify({ paymentDate, notes: notes.trim() || undefined }),
      }),
    onSuccess: (result) => onDone(result.receipt),
  });
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-sm font-bold text-foreground">Receive admission fee: {app.firstName} {app.lastName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{app.applicationNumber} · {app.class.name}</p>
        <p className="mt-4 rounded-lg bg-muted p-3 text-center text-2xl font-bold text-foreground">{money(app.feeDue)}</p>
        <label className="mt-3 block text-xs font-semibold">
          Date received
          <input type="date" max={new Date().toISOString().slice(0, 10)} className={input} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </label>
        <label className="mt-3 block text-xs font-semibold">
          Note (optional)
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="mt-3 flex items-start gap-2 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have received {money(app.feeDue)} in cash. It is recorded as school income and is not refundable, whatever the admission outcome.
        </label>
        {receive.error && <p role="alert" className="mt-3 text-xs text-rose-600">{errorText(receive.error)}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={!confirmed || receive.isPending} onClick={() => receive.mutate()}>
            {receive.isPending ? "Recording…" : "Record cash received"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExemptFeeDialog({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const exempt = useMutation({
    mutationFn: () =>
      apiFetch(`/admissions/applications/${app.id}/fee/exemption`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      }),
    onSuccess: onDone,
  });
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-sm font-bold text-foreground">Exempt from admission fee: {app.firstName} {app.lastName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The applicant can then sit the exam without paying. The reason is kept on record and cannot be left blank.
        </p>
        <label className="mt-3 block text-xs font-semibold">
          Reason for exemption (required)
          <textarea className={`${input} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Child of a staff member, approved by the headteacher" />
        </label>
        {exempt.error && <p role="alert" className="mt-3 text-xs text-rose-600">{errorText(exempt.error)}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={primary} disabled={reason.trim().length < 5 || exempt.isPending} onClick={() => exempt.mutate()}>
            Confirm exemption
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- exam editor

const EDITABLE_EXAM_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "EXAM_SCHEDULED", "EXAM_COMPLETED"];

/** ISO timestamp -> value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const scoreText = (value: string | null) => (value === null ? "" : String(Number(value)));

/**
 * The applicant's exam: date and time, venue and score, editable in place.
 * Staff can schedule, reschedule, enter a score and correct it until a
 * decision is made. Saving sends only what changed.
 */
function ExamCell({ app, canEdit, onSaved }: { app: Application; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [score, setScore] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const max = Number(app.cycle.examMaxScore);
  const pass = Number(app.cycle.passMark);
  const editable = canEdit && EDITABLE_EXAM_STATUSES.includes(app.status);
  const feePending = app.feeStatus === "PENDING";

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/admissions/applications/${app.id}/exam`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  function open() {
    setDate(toLocalInput(app.examDate));
    setVenue(app.examVenue ?? "");
    setScore(scoreText(app.examScore));
    setFormError(null);
    save.reset();
    setEditing(true);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const body: Record<string, unknown> = {};
    const venueChanged = venue.trim() !== (app.examVenue ?? "");
    const dateChanged = date !== toLocalInput(app.examDate);
    if (dateChanged || venueChanged) {
      if (!date) return setFormError("Choose the exam date and time.");
      if (venue.trim().length < 2) return setFormError("Enter the exam venue.");
      if (Number.isNaN(new Date(date).getTime())) return setFormError("Enter a valid exam date and time.");
      if (dateChanged) body.examDate = new Date(date).toISOString();
      if (venueChanged) body.venue = venue.trim();
    }
    if (score !== scoreText(app.examScore)) {
      if (score.trim() === "") {
        body.score = null;
      } else {
        const n = Number(score);
        if (Number.isNaN(n) || n < 0) return setFormError("Enter a valid score.");
        if (n > max) return setFormError(`The score cannot be above ${max}.`);
        body.score = n;
      }
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    save.mutate(body);
  }

  if (editing) {
    return (
      <form onSubmit={submit} noValidate className="space-y-2.5" aria-label={`Edit exam for ${app.firstName} ${app.lastName}`}>
        <label className="block text-[11px] font-semibold text-foreground">
          Date and time
          <input type="datetime-local" className={`${input} !mt-1 !h-9 text-xs`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-[11px] font-semibold text-foreground">
          Venue
          <input className={`${input} !mt-1 !h-9 text-xs`} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Main Hall" />
        </label>
        <label className="block text-[11px] font-semibold text-foreground">
          Score <span className="font-normal text-muted-foreground">(out of {max}, pass mark {pass})</span>
          <input
            type="number"
            min={0}
            max={max}
            step="any"
            inputMode="decimal"
            className={`${input} !mt-1 !h-9 text-xs disabled:cursor-not-allowed disabled:opacity-60`}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            disabled={feePending && app.examScore === null}
            placeholder="Not yet marked"
          />
        </label>
        {feePending && (
          <p className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
            The score can be entered once the admission fee is received or waived.
          </p>
        )}
        {(formError || save.error) && (
          <p role="alert" className="text-[11px] text-destructive">
            {formError ?? errorText(save.error)}
          </p>
        )}
        <div className="flex gap-1.5">
          <button type="submit" className={primary} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" className={ghost} onClick={() => setEditing(false)} disabled={save.isPending}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const score_ = app.examScore === null ? null : Number(app.examScore);
  return (
    <div className="space-y-1">
      {app.examDate ? (
        <p className="text-muted-foreground">
          {new Date(app.examDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          {app.examVenue ? ` · ${app.examVenue}` : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">Not scheduled</p>
      )}
      {score_ !== null ? (
        <p className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
          Score {score_}/{max}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${score_ >= pass ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
          >
            {score_ >= pass ? "Passed" : "Below pass mark"}
          </span>
        </p>
      ) : (
        app.examDate && <p className="text-muted-foreground">No score yet</p>
      )}
      {editable && (
        <button
          type="button"
          onClick={open}
          aria-label={`Edit exam for ${app.firstName} ${app.lastName}`}
          className="mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
        >
          <Pencil className="size-3" />
          {app.examDate ? "Edit exam" : "Schedule exam"}
        </button>
      )}
    </div>
  );
}
