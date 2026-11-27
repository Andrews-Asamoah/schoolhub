import { useQuery } from "@tanstack/react-query";
import { Download, ReceiptText } from "lucide-react";
import type { TeacherPayslip } from "@schoolhub/shared";
import { Button } from "@/components/ui/button";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { ServerExportButton } from "./server-export-button";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
});
const month = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function TeacherPayrollWorkspace() {
  const { data: session } = useSession();
  const query = useQuery({
    queryKey: ["teacher-payslips", getClientSubdomain(), session?.user.id],
    queryFn: ({ signal }) =>
      apiFetch<TeacherPayslip[]>("/finance/me/payslips", {
        signal,
        cache: "no-store",
      }),
    enabled: !!session?.user.id,
    retry: false,
    gcTime: 0,
  });

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <ReceiptText className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              My payroll
            </h1>
            <p className="text-sm text-muted-foreground">
              View approved payslips and download a copy for your records.
            </p>
          </div>
        </div>
      </header>
      {query.isPending && (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Loading your payslips…
        </p>
      )}
      {query.error && (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-card p-4">
          <p role="alert" className="text-sm text-destructive">
            Could not load your payslips. {query.error.message}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.isSuccess &&
        (query.data.length ? (
          <ul className="space-y-3">
            {query.data.map((slip) => (
              <li key={slip.id}>
                <PayslipCard slip={slip} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Your payslips will appear here once payroll is approved.
          </p>
        ))}
    </section>
  );
}

function PayslipCard({ slip }: { slip: TeacherPayslip }) {
  const period = month.format(
    new Date(
      Date.UTC(slip.payrollRecord.year, slip.payrollRecord.month - 1, 1),
    ),
  );
  const paid = slip.payrollRecord.status === "PAID";
  const rows = [
    ["Basic salary", slip.basicSalary],
    ["Allowances", slip.allowances],
    ["Gross pay", slip.grossSalary],
    ["Employee SSNIT", slip.ssnitEmployee],
    ["PAYE", slip.incomeTax],
    ["Other deductions", slip.otherDeductions],
  ];

  return (
    <details className="rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="ml-2 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 align-middle">
          <span className="font-semibold text-foreground">{period}</span>
          <span
            className={
              paid
                ? "rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success"
                : "rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
            }
          >
            {paid ? "Paid" : "Approved · awaiting payment"}
          </span>
          <span className="text-sm tabular-nums text-foreground">
            {money.format(Number(slip.netSalary))} net pay
          </span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-3 border-b border-border py-1.5 text-sm"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums text-foreground">
                {money.format(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        <ServerExportButton
          endpoint={`/finance/me/payslips/${encodeURIComponent(slip.id)}/pdf`}
          label="Download PDF"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          icon={<Download className="size-4" aria-hidden />}
        />
      </div>
    </details>
  );
}
