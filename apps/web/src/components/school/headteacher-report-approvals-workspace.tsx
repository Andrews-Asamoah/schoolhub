import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  MIN_RECOMMENDATION_LENGTH, ReportRecommendationTable,
  type RecommendationRowState, type RecommendationTableRow, type RecordedRemark,
} from "@/components/reports/report-recommendation-table";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { apiFetch, errorText } from "@/lib/api";

type HeadQueueRow = {
  id: string; stage: string; version: number; canApprove: boolean; className: string;
  teacherName: string | null; teacherRemark: string | null; headName: string | null; headRemark: string | null;
  /** Your recommendation from the previous version of this report, kept when the batch was regenerated. */
  carriedHeadRemark: string | null;
  average: number | null; position: number | null; classSize: number | null;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  set: { name: string; term: { name: string } };
  subjects: { name: string; grade: string | null; percentage: number }[];
};

type BulkResult = { total: number; succeeded: number; results: { id: string; ok: boolean; error?: string }[] };
type StatusFilter = "ready" | "waiting" | "approved" | "all";

const QUEUE_KEY = ["assessments", "report-cards", "head-queue"] as const;
const BASE = "/assessments/report-cards/versions/";

const statusLabel = (row: HeadQueueRow) =>
  row.stage === "APPROVED" ? "Approved"
    : row.stage === "GENERATED" ? "Waiting for class teacher"
      : row.canApprove ? "Ready to approve" : "You gave the class recommendation";

function matchesStatus(row: HeadQueueRow, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "approved") return row.stage === "APPROVED";
  if (filter === "waiting") return row.stage === "GENERATED" || (row.stage === "TEACHER_REVIEWED" && !row.canApprove);
  return row.stage === "TEACHER_REVIEWED" && row.canApprove;
}

/**
 * The headteacher's cross-batch queue: every pupil in an unpublished report batch with the class
 * teacher's recommendation read-only beside an editable headteacher recommendation, and per-row
 * and bulk approval. The server enforces the real rules (headteacher only, never both stages by the
 * same person); this page just reflects them.
 */
export function HeadteacherReportApprovalsWorkspace() {
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => apiFetch<HeadQueueRow[]>("/assessments/report-cards/head-queue"),
    retry: false,
  });

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [rowStates, setRowStates] = useState<Record<string, RecommendationRowState | undefined>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ready");
  const [batch, setBatch] = useState("");
  const [className, setClassName] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const term = useDebouncedValue(search.trim().toLowerCase(), 200);

  const patchState = useCallback((id: string, next: RecommendationRowState | undefined) =>
    setRowStates((prev) => ({ ...prev, [id]: next })), []);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY }),
      // The publication page shows the same approvals per batch.
      queryClient.invalidateQueries({ queryKey: ["assessments", "report-cards"] }),
    ]);
  }, [queryClient]);

  const all = queue.data ?? [];
  const batches = useMemo(() => [...new Set(all.map((row) => `${row.set.name} · ${row.set.term.name}`))].sort(), [all]);
  const classes = useMemo(() => [...new Set(all.map((row) => row.className))].sort(), [all]);
  const counts = useMemo(() => ({
    ready: all.filter((row) => matchesStatus(row, "ready")).length,
    waiting: all.filter((row) => matchesStatus(row, "waiting")).length,
    approved: all.filter((row) => matchesStatus(row, "approved")).length,
  }), [all]);

  const rows = useMemo(() => all.filter((row) => {
    if (!matchesStatus(row, status)) return false;
    if (batch && `${row.set.name} · ${row.set.term.name}` !== batch) return false;
    if (className && row.className !== className) return false;
    if (!term) return true;
    const name = `${row.student.profile.firstName} ${row.student.profile.lastName}`.toLowerCase();
    return name.includes(term) || (row.student.admissionNumber ?? "").toLowerCase().includes(term);
  }).sort((a, b) =>
    a.className.localeCompare(b.className) || (a.position ?? Infinity) - (b.position ?? Infinity)),
  [all, status, batch, className, term]);

  const tableRows: RecommendationTableRow[] = rows.map((row) => {
    const recorded: RecordedRemark[] = [{ label: `Class teacher${row.teacherName ? ` (${row.teacherName})` : ""}`, text: row.teacherRemark }];
    if (row.stage === "APPROVED") recorded.push({ label: `Headteacher${row.headName ? ` (${row.headName})` : ""}`, text: row.headRemark });
    return {
      id: row.id,
      pupilName: `${row.student.profile.firstName} ${row.student.profile.lastName}`.trim(),
      admissionNumber: row.student.admissionNumber,
      context: `${row.className} · ${row.set.name} · v${row.version}`,
      average: row.average, position: row.position, classSize: row.classSize,
      subjects: row.subjects,
      statusLabel: statusLabel(row),
      recordedRemark: row.stage === "GENERATED" ? null : recorded,
      editable: row.canApprove,
    };
  });

  // What is in each box: what was typed this session, else the text carried over from a regenerated version.
  const remarkOf = useCallback((id: string) => typed[id] ?? all.find((row) => row.id === id)?.carriedHeadRemark ?? "", [typed, all]);
  const remarks = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, remarkOf(row.id)])), [rows, remarkOf]);
  const displayStates = useMemo(() => {
    const merged: Record<string, RecommendationRowState | undefined> = {};
    for (const row of rows) {
      if (row.canApprove && row.carriedHeadRemark && typed[row.id] === undefined) merged[row.id] = { note: "Carried over from the previous version of this report. Check it still applies, then approve." };
    }
    return { ...merged, ...Object.fromEntries(Object.entries(rowStates).filter(([, state]) => state !== undefined)) };
  }, [rows, typed, rowStates]);
  const readyIds = [...selected].filter((id) => remarkOf(id).trim().length >= MIN_RECOMMENDATION_LENGTH);

  const approveRow = useCallback(async (id: string) => {
    patchState(id, { pending: true });
    try {
      await apiFetch(BASE + encodeURIComponent(id) + "/head-approve", { method: "PATCH", body: JSON.stringify({ remark: remarkOf(id).trim() }) });
      patchState(id, undefined);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      await refresh();
    } catch (error) {
      patchState(id, { error: errorText(error, "This report could not be approved.") });
    }
  }, [remarkOf, patchState, refresh]);

  const approveBulk = async () => {
    const items = readyIds.map((id) => ({ id, remark: remarkOf(id).trim() }));
    if (!items.length) return;
    setBulkPending(true); setBulkMessage(null);
    items.forEach((item) => patchState(item.id, { pending: true }));
    try {
      const result = await apiFetch<BulkResult>(BASE + "bulk-head-approve", { method: "POST", body: JSON.stringify({ items }) });
      const failed = new Map(result.results.filter((r) => !r.ok).map((r) => [r.id, r.error ?? "Not approved."]));
      setRowStates((prev) => {
        const next = { ...prev };
        for (const item of items) next[item.id] = failed.has(item.id) ? { error: failed.get(item.id) } : undefined;
        return next;
      });
      setSelected((prev) => new Set([...prev].filter((id) => failed.has(id))));
      setBulkMessage(`${result.succeeded} of ${result.total} reports approved.${failed.size ? " Fix the rows marked in red and try again." : ""}`);
      await refresh();
    } catch (error) {
      items.forEach((item) => patchState(item.id, undefined));
      setBulkMessage(errorText(error, "The reports could not be approved."));
    } finally {
      setBulkPending(false);
    }
  };

  const tab = (id: StatusFilter, label: string, count?: number) =>
    <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${status === id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
      {label}{count === undefined ? "" : ` (${count})`}
    </button>;

  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div>
      <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="size-5 text-primary" /> Report approvals</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Review each pupil’s results and the class teacher’s recommendation, then record your own recommendation to approve.
        A report cannot be published until every pupil in the batch is approved, and you cannot approve a report
        whose class recommendation you wrote yourself.
      </p>
    </div>
    {queue.isPending && <p className="text-sm text-muted-foreground">Loading reports for approval…</p>}
    {queue.isError && <p role="alert" className="text-sm text-destructive">{queue.error.message}</p>}
    {!queue.isPending && !queue.isError && all.length === 0 && <p className="text-sm text-muted-foreground">
      No unpublished report batches have pupils waiting for approval.
    </p>}
    {all.length > 0 && <>
      <div className="flex flex-wrap items-center gap-2">
        {tab("ready", "Ready to approve", counts.ready)}
        {tab("waiting", "Waiting", counts.waiting)}
        {tab("approved", "Approved", counts.approved)}
        {tab("all", "All")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or admission number" aria-label="Search pupils"
          className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm" />
        <select value={batch} onChange={(event) => setBatch(event.target.value)} aria-label="Report batch"
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">All batches</option>
          {batches.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={className} onChange={(event) => setClassName(event.target.value)} aria-label="Class"
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">All classes</option>
          {classes.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{readyIds.length} of {selected.size} selected ready to approve</span>
          <button type="button" onClick={() => void approveBulk()} disabled={bulkPending || readyIds.length === 0}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
            {bulkPending ? "Approving…" : "Approve selected"}
          </button>
        </div>
      </div>
      {bulkMessage && <p role="status" className="text-xs text-muted-foreground">{bulkMessage}</p>}
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">No pupils match.</p>
        : <ReportRecommendationTable
            rows={tableRows} remarks={remarks} rowStates={displayStates} selected={selected}
            onRemarkChange={(id, text) => setTyped((prev) => ({ ...prev, [id]: text }))}
            onToggleRow={(id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
            onToggleAll={(ids, checked) => setSelected((prev) => { const next = new Set(prev); for (const id of ids) { if (checked) next.add(id); else next.delete(id); } return next; })}
            onSubmitRow={(id) => void approveRow(id)}
            submitLabel="Approve" remarkColumnLabel="Headteacher recommendation"
            remarkPlaceholder="Your recommendation and conclusion for this pupil" />}
    </>}
  </section>;
}
