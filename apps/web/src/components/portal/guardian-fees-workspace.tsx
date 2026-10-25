import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, LoaderCircle, Printer, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { StudentStatementResponse } from "@schoolhub/shared";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

function fullName(ward: StudentProfileData) {
  return [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName].filter(Boolean).join(" ") || ward.admissionNumber || "Student";
}
const money = (value: string | number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(Number(value) || 0);
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export function GuardianFeesWorkspace() {
  const [wardId, setWardId] = useState("");
  const [exporting, setExporting] = useState(false);
  const wardsQuery = useQuery({
    queryKey: ["students", "my-wards"],
    queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"),
    retry: false,
  });
  const wards = wardsQuery.data ?? [];
  const selectedId = wards.some((ward) => ward.id === wardId) ? wardId : wards[0]?.id ?? "";
  const selected = wards.find((ward) => ward.id === selectedId);
  const statementQuery = useQuery({
    queryKey: ["students", "my-wards", selectedId, "fees"],
    queryFn: () => apiFetch<StudentStatementResponse>(`/students/my-wards/${encodeURIComponent(selectedId)}/fees?scope=all`),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const statement = statementQuery.data;
  const rows = useMemo(() => statement?.entries ?? [], [statement?.entries]);
  const filename = (statement?.student.admissionNumber || selectedId || "ward").replace(/[^a-zA-Z0-9_-]/g, "-");

  const exportPdf = () => {
    if (!statement) return;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.setFontSize(16); pdf.text("Student statement of account", 14, 18);
    pdf.setFontSize(10);
    pdf.text(statement.student.name, 14, 26);
    pdf.text(`Admission number: ${statement.student.admissionNumber ?? "—"}`, 14, 32);
    pdf.text(`Opening balance: GHS ${statement.openingBalance}`, 14, 38);
    autoTable(pdf, {
      startY: 44,
      head: [["Date", "Type", "Reference", "Description", "Amount (GHS)", "Balance (GHS)"]],
      body: rows.map((row) => [row.date, row.type, row.reference, row.description, row.amount, row.runningBalance]),
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 3: { cellWidth: 48 }, 4: { halign: "right" }, 5: { halign: "right" } },
      didDrawPage: () => { pdf.setFontSize(8); pdf.text("Confidential · Guardian copy", 14, 287); pdf.text(`Page ${pdf.getNumberOfPages()}`, 194, 287, { align: "right" }); },
    });
    pdf.save(`ward-statement-${filename}.pdf`);
  };

  const exportExcel = async () => {
    if (!statement) return;
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SchoolHub";
      workbook.created = new Date();
      const info = workbook.addWorksheet("Report info");
      info.addRows([
        ["Report", "Ward statement of account"],
        ["Student", statement.student.name],
        ["Admission number", statement.student.admissionNumber ?? "—"],
        ["Scope", "All time"],
        ["Opening balance (GHS)", Number(statement.openingBalance)],
        ["Closing balance (GHS)", Number(statement.closingBalance)],
        ["Unallocated credit (GHS)", Number(statement.unallocatedCredit)],
        ["Generated at", new Date().toISOString()],
      ]);
      info.getColumn(1).width = 28; info.getColumn(2).width = 40;
      [5,6,7].forEach((n) => { info.getCell(n,2).numFmt = "#,##0.00"; });
      const sheet = workbook.addWorksheet("Statement", { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.columns = [
        { header: "Date", key: "date", width: 14 },
        { header: "Type", key: "type", width: 14 },
        { header: "Reference", key: "reference", width: 20 },
        { header: "Description", key: "description", width: 48 },
        { header: "Amount (GHS)", key: "amount", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Running balance (GHS)", key: "balance", width: 22, style: { numFmt: "#,##0.00" } },
      ];
      rows.forEach((row) => sheet.addRow({ date: row.date, type: row.type, reference: row.reference, description: row.description, amount: Number(row.amount), balance: Number(row.runningBalance) }));
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: "A1", to: "F1" };
      const bytes = await workbook.xlsx.writeBuffer();
      downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `ward-statement-${filename}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Family centre</p>
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight text-foreground">Ward fees</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">View only the fee statement for a child linked to your guardian account.</p></div>
        {wards.length > 0 && <div className="w-full sm:w-72"><label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Child</label><Select value={selectedId} onValueChange={setWardId}><SelectTrigger className="h-11 w-full text-sm"><SelectValue placeholder="Choose a child" /></SelectTrigger><SelectContent>{wards.map((ward) => <SelectItem key={ward.id} value={ward.id}>{fullName(ward)}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      {selected && <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/50 p-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="text-sm font-semibold text-foreground">{fullName(selected)}</p><p className="text-xs text-muted-foreground">{selected.class?.name ?? "Class not assigned"} · {selected.admissionNumber ?? "No admission number"}</p></div></div>}
    </section>
    {wardsQuery.isPending ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading linked children…</div> :
      wardsQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Your linked children could not be loaded. Please try again later.</div> :
      wards.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold text-foreground">No children linked yet</h3><p className="mt-2 text-sm text-muted-foreground">Contact the school office to link your child to this guardian account.</p></div> :
      statementQuery.isPending ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading ward statement…</div> :
      statementQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">The fee statement could not be loaded. {statementQuery.error.message}</div> :
      statement ? <div className="ward-statement-print space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Closing balance",statement.closingBalance],["Overdue 90+ days",statement.ageing.days90Plus],["Unallocated credit",statement.unallocatedCredit]].map(([label,value])=><div key={label} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-foreground">{money(value ?? "0.00")}</p></div>)}
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">Fee statement</p><p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="size-4 text-primary" /> Verified ward access</p></div>
        </div>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">{statement.student.name}</h3><p className="mt-1 text-sm text-muted-foreground">Admission no. {statement.student.admissionNumber ?? "—"} · All academic years</p><p className="mt-1 text-xs text-muted-foreground">Opening balance: {money(statement.openingBalance)}</p></div><div className="ward-statement-actions flex flex-wrap gap-2"><button type="button" className={secondaryButton} onClick={() => window.print()}><Printer className="size-4" /> Print</button><button type="button" className={secondaryButton} onClick={exportPdf}><FileText className="size-4" /> PDF</button><button type="button" className={secondaryButton} onClick={() => void exportExcel()} disabled={exporting}><FileSpreadsheet className="size-4" /> {exporting ? "Preparing…" : "Excel"}</button></div></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Reference</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Running balance</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id} className="border-b border-border/70"><td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3">{row.type}</td><td className="p-3">{row.reference}</td><td className="p-3">{row.description}</td><td className="p-3 text-right tabular-nums">{money(row.amount)}</td><td className="p-3 text-right font-semibold tabular-nums">{money(row.runningBalance)}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No statement activity found.</td></tr>}</tbody><tfoot><tr className="border-t-2 border-border font-bold"><td colSpan={5} className="p-3">Closing balance</td><td className="p-3 text-right tabular-nums">{money(statement.closingBalance)}</td></tr></tfoot></table></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{[["0–30 days",statement.ageing.days0To30],["31–60 days",statement.ageing.days31To60],["61–90 days",statement.ageing.days61To90],["90+ days",statement.ageing.days90Plus],["Not due / no due date",statement.ageing.notDue]].map(([label,value])=><div key={label} className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(value)}</p></div>)}</div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">This statement is currently reconstructed from saved bills and receipt allocations. A dedicated receivables ledger will become the accounting source of truth in a later phase.</p>
        </section>
        <style>{`@media print { body * { visibility: hidden !important; } .ward-statement-print, .ward-statement-print * { visibility: visible !important; } .ward-statement-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 8mm !important; background: white !important; color: black !important; } .ward-statement-actions { display: none !important; } @page { size: A4 landscape; margin: 8mm; } }`}</style>
      </div> : null}
  </div>;
}
