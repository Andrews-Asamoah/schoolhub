import { Download, FileSpreadsheet, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The two cards under the dropzone on the first step of every bulk upload:
 * where to get the template, and the rules to follow. This is the layout the
 * student import introduced, shared so every upload reads the same.
 */
export function ImportStartPanels({
  templateText,
  templateBusy = false,
  onExcel,
  onCsv,
  notes,
}: {
  templateText: ReactNode;
  templateBusy?: boolean;
  onExcel: () => void;
  onCsv: () => void;
  notes: ReactNode[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-border p-4">
        <h3 className="text-xs font-bold text-foreground">Start from the template</h3>
        <p className="mt-1 text-xs text-muted-foreground">{templateText}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={templateBusy} onClick={onExcel} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {templateBusy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="size-3.5" />} Excel template
          </button>
          <button type="button" onClick={onCsv} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">
            <Download aria-hidden="true" className="size-3.5" /> CSV template
          </button>
        </div>
      </section>
      <section className="rounded-xl border border-border p-4">
        <h3 className="text-xs font-bold text-foreground">Good to know</h3>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {notes.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      </section>
    </div>
  );
}
