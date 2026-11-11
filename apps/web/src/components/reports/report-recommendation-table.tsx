import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RecommendationSubject = { name: string; grade: string | null; percentage: number };

export type RecommendationTableRow = {
  id: string;
  pupilName: string;
  admissionNumber: string | null;
  /** Shown under the name, e.g. the report batch and term. */
  context?: string;
  average: number | null;
  position: number | null;
  classSize: number | null;
  subjects: RecommendationSubject[];
  /** A short status label for the row (for example "Waiting for headteacher"). */
  statusLabel?: string;
  /** Text already recorded on the report, shown read-only above any editable box (for example the class teacher's recommendation). */
  recordedRemark?: RecordedRemark | RecordedRemark[] | null;
  /** When true the recommendation box is editable; otherwise the recorded text is shown. */
  editable: boolean;
};

export type RecordedRemark = { label: string; text: string | null };

export type RecommendationRowState = {
  pending?: boolean;
  /** Short note such as "Draft saved". */
  note?: string;
  error?: string;
};

export const MIN_RECOMMENDATION_LENGTH = 10;
export const MAX_RECOMMENDATION_LENGTH = 2000;

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * One row per pupil: name, average, position and the recommendation. The same table is used by the
 * class teacher and by the headteacher; only which rows are editable and what the action button says
 * differ. It holds no data of its own, so the page decides how drafts are saved and submitted.
 */
export function ReportRecommendationTable({
  rows, remarks, onRemarkChange, rowStates, selected, onToggleRow, onToggleAll,
  onSubmitRow, submitLabel, remarkColumnLabel = "Recommendation", remarkPlaceholder,
}: {
  rows: RecommendationTableRow[];
  /** The text currently in each editable row's box, keyed by row id. */
  remarks: Record<string, string>;
  onRemarkChange: (id: string, text: string) => void;
  rowStates: Record<string, RecommendationRowState | undefined>;
  selected: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onSubmitRow: (id: string) => void;
  submitLabel: string;
  remarkColumnLabel?: string;
  remarkPlaceholder?: string;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const editableIds = rows.filter((row) => row.editable).map((row) => row.id);
  const allChecked = editableIds.length > 0 && editableIds.every((id) => selected.has(id));
  const toggleOpen = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">
          <input type="checkbox" aria-label="Select all pupils waiting for a recommendation"
            checked={allChecked} disabled={editableIds.length === 0}
            onChange={(event) => onToggleAll(editableIds, event.target.checked)} />
        </TableHead>
        <TableHead>Pupil</TableHead>
        <TableHead className="text-right">Average %</TableHead>
        <TableHead className="text-right">Position</TableHead>
        <TableHead className="min-w-72">{remarkColumnLabel}</TableHead>
        <TableHead className="w-40"><span className="sr-only">Action</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => {
        const state = rowStates[row.id];
        const text = remarks[row.id] ?? "";
        const trimmed = text.trim().length;
        const expanded = open.has(row.id);
        const recorded = row.recordedRemark ? [row.recordedRemark].flat() : [];
        const tooShort = trimmed < MIN_RECOMMENDATION_LENGTH;
        return <Fragment key={row.id}>
          <TableRow data-state={selected.has(row.id) ? "selected" : undefined}>
            <TableCell className="align-top">
              <input type="checkbox" aria-label={`Select ${row.pupilName}`}
                checked={selected.has(row.id)} disabled={!row.editable}
                onChange={() => onToggleRow(row.id)} />
            </TableCell>
            <TableCell className="align-top">
              <button type="button" aria-expanded={expanded} onClick={() => toggleOpen(row.id)}
                className="flex items-start gap-1 text-left">
                {expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                <span>
                  <span className="block text-sm font-semibold">{row.pupilName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[row.admissionNumber ?? "No admission number", row.context].filter(Boolean).join(" · ")}
                  </span>
                  {row.statusLabel && <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold">{row.statusLabel}</span>}
                </span>
              </button>
            </TableCell>
            <TableCell className="text-right align-top tabular-nums">{row.average == null ? "—" : row.average.toFixed(1)}</TableCell>
            <TableCell className="text-right align-top tabular-nums">
              {row.position == null ? "—" : <>{ordinal(row.position)}{row.classSize ? <span className="text-muted-foreground"> / {row.classSize}</span> : null}</>}
            </TableCell>
            <TableCell className="align-top">
              {recorded.map((remark) => <p key={remark.label} className="mb-2 text-xs text-muted-foreground">
                <span className="font-semibold">{remark.label}:</span> {remark.text ?? "—"}
              </p>)}
              {row.editable
                ? <>
                    <textarea aria-label={`${remarkColumnLabel} for ${row.pupilName}`} rows={2} maxLength={MAX_RECOMMENDATION_LENGTH}
                      className="w-full rounded-lg border border-input bg-background p-2 text-sm"
                      value={text} placeholder={remarkPlaceholder}
                      onChange={(event) => onRemarkChange(row.id, event.target.value)} />
                    <p className={cn("mt-1 text-xs", state?.error ? "text-destructive" : "text-muted-foreground")} role={state?.error ? "alert" : "status"}>
                      {state?.error ?? state?.note ?? (trimmed > 0 && tooShort ? `At least ${MIN_RECOMMENDATION_LENGTH} characters to sign off.` : "")}
                    </p>
                  </>
                : recorded.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            </TableCell>
            <TableCell className="align-top">
              {row.editable && <button type="button"
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
                disabled={state?.pending || tooShort} onClick={() => onSubmitRow(row.id)}>
                {state?.pending ? "Saving…" : submitLabel}
              </button>}
            </TableCell>
          </TableRow>
          {expanded && <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableCell />
            <TableCell colSpan={5} className="py-3">
              {row.subjects.length === 0
                ? <p className="text-xs text-muted-foreground">No subject results in this report.</p>
                : <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {row.subjects.map((subject) => <li key={subject.name} className="flex justify-between gap-3">
                      <span>{subject.name}</span>
                      <span className="tabular-nums text-muted-foreground">{subject.percentage}% ({subject.grade ?? "—"})</span>
                    </li>)}
                  </ul>}
            </TableCell>
          </TableRow>}
        </Fragment>;
      })}
    </TableBody>
  </Table>;
}
