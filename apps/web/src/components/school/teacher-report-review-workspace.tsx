import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MIN_RECOMMENDATION_LENGTH, ReportRecommendationTable,
  type RecommendationRowState, type RecommendationTableRow,
} from "@/components/reports/report-recommendation-table";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { ReportVersionViewer } from "@/components/school/report-version-viewer";
import { apiFetch, errorText } from "@/lib/api";

type QueueRow = {
  id: string; stage: string; version: number; teacherRemark: string | null;
  average: number | null; position: number | null; classSize: number | null; draftRemark: string | null;
  /** True when draftRemark is the recommendation carried over from a regenerated version, not text typed this time. */
  carriedOver: boolean;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  set: { name: string; term: { name: string } };
  subjects: { name: string; grade: string | null; percentage: number }[];
};

type BulkResult = { total: number; succeeded: number; results: { id: string; ok: boolean; error?: string }[] };

const QUEUE_KEY = ["assessments", "report-cards", "teacher-queue"] as const;
const BASE = "/assessments/report-cards/versions/";
const AUTOSAVE_MS = 800;

const stageLabel = (stage: string) =>
  stage === "GENERATED" ? "Recommendation needed" : stage === "TEACHER_REVIEWED" ? "Waiting for headteacher" : "Headteacher approved";

export function TeacherReportReviewWorkspace() {
  const queryClient = useQueryClient();
  const reports = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => apiFetch<QueueRow[]>("/assessments/report-cards/teacher-queue"),
    retry: false,
  });

  // What the teacher has typed this session. A row not in here shows its saved draft.
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [rowStates, setRowStates] = useState<Record<string, RecommendationRowState | undefined>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());
  const term = useDebouncedValue(search.trim().toLowerCase(), 200);

  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)); }, []);

  const patchState = useCallback((id: string, next: RecommendationRowState | undefined) =>
    setRowStates((prev) => ({ ...prev, [id]: next })), []);

  const remarkFor = useCallback((row: QueueRow) => typed[row.id] ?? row.draftRemark ?? "", [typed]);

  const saveDraft = useCallback(async (id: string, text: string) => {
    patchState(id, { note: "Saving draft…" });
    try {
      await apiFetch(BASE + encodeURIComponent(id) + "/draft", { method: "PUT", body: JSON.stringify({ remark: text }) });
      patchState(id, text.trim() ? { note: "Draft saved" } : undefined);
    } catch (error) {
      patchState(id, { error: `Draft not saved: ${errorText(error)}` });
    }
  }, [patchState]);

  const onRemarkChange = useCallback((id: string, text: string) => {
    setTyped((prev) => ({ ...prev, [id]: text }));
    const existing = timers.current.get(id);
    if (existing) window.clearTimeout(existing);
    timers.current.set(id, window.setTimeout(() => { timers.current.delete(id); void saveDraft(id, text); }, AUTOSAVE_MS));
  }, [saveDraft]);

  const cancelAutosave = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) { window.clearTimeout(timer); timers.current.delete(id); }
  };

  const submitRow = useCallback(async (id: string) => {
    const row = reports.data?.find((item) => item.id === id);
    if (!row) return;
    cancelAutosave(id);
    patchState(id, { pending: true });
    try {
      await apiFetch(BASE + encodeURIComponent(id) + "/recommend", { method: "POST", body: JSON.stringify({ remark: remarkFor(row).trim() }) });
      patchState(id, undefined);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    } catch (error) {
      patchState(id, { error: errorText(error, "This recommendation could not be saved.") });
    }
  }, [reports.data, remarkFor, patchState, queryClient]);

  const rows = useMemo(() => (reports.data ?? []).filter((row) => {
    if (onlyPending && row.stage !== "GENERATED") return false;
    if (!term) return true;
    const name = `${row.student.profile.firstName} ${row.student.profile.lastName}`.toLowerCase();
    return name.includes(term) || (row.student.admissionNumber ?? "").toLowerCase().includes(term);
  }), [reports.data, onlyPending, term]);

  const tableRows: RecommendationTableRow[] = rows.map((row) => ({
    id: row.id,
    pupilName: `${row.student.profile.firstName} ${row.student.profile.lastName}`.trim(),
    admissionNumber: row.student.admissionNumber,
    context: `${row.set.name} · ${row.set.term.name} · v${row.version}`,
    average: row.average, position: row.position, classSize: row.classSize,
    subjects: row.subjects,
    statusLabel: stageLabel(row.stage),
    recordedRemark: row.stage === "GENERATED" ? null : { label: "Your recommendation", text: row.teacherRemark },
    editable: row.stage === "GENERATED",
  }));

  const remarks = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, remarkFor(row)])), [rows, remarkFor]);
  // Until the teacher edits it, a carried-over recommendation says where it came from.
  const displayStates = useMemo(() => {
    const merged: Record<string, RecommendationRowState | undefined> = {};
    for (const row of rows) {
      if (row.carriedOver && typed[row.id] === undefined) merged[row.id] = { note: "Carried over from the previous version of this report. Check it still applies, then sign off." };
    }
    return { ...merged, ...Object.fromEntries(Object.entries(rowStates).filter(([, state]) => state !== undefined)) };
  }, [rows, typed, rowStates]);
  const readyIds = [...selected].filter((id) => (remarks[id] ?? "").trim().length >= MIN_RECOMMENDATION_LENGTH);

  const submitBulk = async () => {
    const items = readyIds.map((id) => ({ id, remark: (remarks[id] ?? "").trim() }));
    if (!items.length) return;
    items.forEach((item) => cancelAutosave(item.id));
    setBulkPending(true); setBulkMessage(null);
    items.forEach((item) => patchState(item.id, { pending: true }));
    try {
      const result = await apiFetch<BulkResult>(BASE + "bulk-recommend", { method: "POST", body: JSON.stringify({ items }) });
      const failed = new Map(result.results.filter((r) => !r.ok).map((r) => [r.id, r.error ?? "Not saved."]));
      setRowStates((prev) => {
        const next = { ...prev };
        for (const item of items) next[item.id] = failed.has(item.id) ? { error: failed.get(item.id) } : undefined;
        return next;
      });
      setSelected((prev) => new Set([...prev].filter((id) => failed.has(id))));
      setBulkMessage(`${result.succeeded} of ${result.total} recommendations signed off.${failed.size ? " Fix the rows marked in red and try again." : ""}`);
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    } catch (error) {
      items.forEach((item) => patchState(item.id, undefined));
      setBulkMessage(errorText(error, "The recommendations could not be saved."));
    } finally {
      setBulkPending(false);
    }
  };

  const pendingCount = (reports.data ?? []).filter((row) => row.stage === "GENERATED").length;

  return <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
    {viewingVersionId && <ReportVersionViewer versionId={viewingVersionId} onClose={() => setViewingVersionId(null)} />}
    <div>
      <h2 className="flex items-center gap-2 text-base font-bold"><ClipboardCheck className="size-5 text-primary" /> Class teacher report recommendations</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Write a recommendation for each pupil. Your text is saved as a draft while you type; signing off records it on the report.
        Headteacher approval is a separate mandatory step before publication.
      </p>
    </div>
    {reports.isPending && <p className="text-sm text-muted-foreground">Loading reports assigned to you…</p>}
    {reports.isError && <p role="alert" className="text-sm text-destructive">{reports.error.message}</p>}
    {!reports.isPending && !reports.isError && !reports.data?.length && <p className="text-sm text-muted-foreground">
      No generated reports require action for your assigned classes.
    </p>}
    {!!reports.data?.length && <>
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or admission number" aria-label="Search pupils"
          className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
          Only pupils needing a recommendation ({pendingCount})
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{readyIds.length} of {selected.size} selected ready to sign off</span>
          <button type="button" onClick={() => void submitBulk()} disabled={bulkPending || readyIds.length === 0}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
            {bulkPending ? "Signing off…" : "Sign off selected"}
          </button>
        </div>
      </div>
      {bulkMessage && <p role="status" className="text-xs text-muted-foreground">{bulkMessage}</p>}
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">No pupils match.</p>
        : <ReportRecommendationTable
            rows={tableRows} remarks={remarks} onRemarkChange={onRemarkChange} rowStates={displayStates}
            selected={selected}
            onToggleRow={(id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
            onToggleAll={(ids, checked) => setSelected((prev) => { const next = new Set(prev); for (const id of ids) { if (checked) next.add(id); else next.delete(id); } return next; })}
            onSubmitRow={(id) => void submitRow(id)}
            submitLabel="Sign off"
            onViewReport={setViewingVersionId}
            remarkPlaceholder="Academic development, strengths and next steps" />}
    </>}
  </section>;
}
