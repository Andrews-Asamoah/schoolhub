import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PortalModal } from "@/components/portal/portal-modal";
import { apiFetch } from "@/lib/api";
import { downloadSalaryWorkbook, readSalaryWorkbook, type SalaryWorkbookEmployee, type SalaryWorkbookRow } from "@/lib/payroll-salary-workbook";

type PreviewRow = SalaryWorkbookRow & { employeeId: string; employeeName: string; expectedSalary: string | null };
type Preview = { rows: PreviewRow[]; issues: { row: number; message: string }[] };
const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

export function PayrollSalaryImportDialog({ employees, onClose, onImported }: {
  employees: SalaryWorkbookEmployee[];
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const template = useMutation({ mutationFn: () => downloadSalaryWorkbook(employees) });
  const preview = useMutation({
    mutationFn: async (workbook: File) => apiFetch<Preview>("/finance/payroll/salaries/import", {
      method: "POST",
      body: JSON.stringify({ mode: "preview", rows: await readSalaryWorkbook(workbook) }),
    }),
  });
  const apply = useMutation({
    mutationFn: (rows: PreviewRow[]) => apiFetch<{ updatedCount: number }>("/finance/payroll/salaries/import", {
      method: "POST", body: JSON.stringify({ mode: "apply", rows }),
    }),
    onSuccess: result => onImported(result.updatedCount),
  });
  const busy = template.isPending || preview.isPending || apply.isPending;
  const error = apply.error ?? preview.error ?? template.error;
  const changes = preview.data?.rows.filter(row => row.expectedSalary !== row.monthlySalary) ?? [];

  return (
    <PortalModal isOpen onClose={() => !busy && onClose()} title="Import monthly salaries" maxWidth="3xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Use the Excel template to update up to 250 employees at a time. Leave salaries blank to skip those employees. Saved payroll runs keep their original amounts.</p>
        <Button variant="outline" onClick={() => template.mutate()} disabled={busy}>
          {template.isPending ? "Preparing template…" : "Download Excel template"}
        </Button>
        <div>
          <label htmlFor="payroll-salary-file" className="mb-2 block text-sm font-medium">Completed workbook</label>
          <input id="payroll-salary-file" type="file" accept=".xlsx" disabled={busy}
            className="block max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground"
            onChange={event => {
              setFile(event.target.files?.[0] ?? null);
              preview.reset();
              apply.reset();
            }}
          />
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>}
        {!!preview.data?.issues.length && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">Correct these rows and upload the workbook again.</p>
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5">
              {preview.data.issues.map(issue => <li key={issue.row}>Row {issue.row}. {issue.message}</li>)}
            </ul>
          </div>
        )}
        {preview.data && (
          <div className="space-y-2">
            <p role="status" className="text-sm font-medium">{changes.length} salary change(s) · {preview.data.rows.length - changes.length} unchanged</p>
            {!!changes.length && (
              <div className="max-h-60 overflow-auto rounded-lg border border-border">
                <Table scroll={false} className="w-full text-left text-sm">
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow><TableHead className="p-2">Row</TableHead><TableHead className="p-2">Employee</TableHead><TableHead className="p-2 text-right">Current</TableHead><TableHead className="p-2 text-right">New</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>{changes.map(row => (
                    <TableRow key={row.row} className="border-t border-border">
                      <TableCell className="p-2">{row.row}</TableCell><TableCell className="p-2">{row.employeeName} <span className="text-xs text-muted-foreground">({row.employeeCode})</span></TableCell>
                      <TableCell className="p-2 text-right tabular-nums">{row.expectedSalary === null ? "—" : currency.format(Number(row.expectedSalary))}</TableCell>
                      <TableCell className="p-2 text-right tabular-nums">{currency.format(Number(row.monthlySalary))}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="outline" disabled={!file || busy} onClick={() => {
            if (file) {
              apply.reset();
              preview.mutate(file);
            }
          }}>{preview.isPending ? "Checking workbook…" : "Preview changes"}</Button>
          <Button disabled={busy || Boolean(apply.error) || !changes.length || Boolean(preview.data?.issues.length)}
            onClick={() => { if (preview.data) apply.mutate(preview.data.rows); }}>
            {apply.isPending ? "Saving salaries…" : "Import salaries"}
          </Button>
        </div>
      </div>
    </PortalModal>
  );
}
