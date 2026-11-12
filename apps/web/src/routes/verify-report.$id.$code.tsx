import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, GraduationCap, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/verify-report/$id/$code")({
  component: VerifyReportPage,
});

interface Verification {
  status: "NOT_FOUND" | "FAILED_INTEGRITY" | "VALID" | "SUPERSEDED";
  school?: string;
  student?: { name: string; admissionNumber: string | null; className: string | null };
  year?: string; term?: string; assessment?: string;
  version?: number; publishedAt?: string | null;
  approvals?: { teacher: { name: string | null; at: string | null }; head: { name: string | null; at: string | null } };
  results?: { average: number | null; position: number | null; classSize: number | null; subjects: { name: string; total: number; grade: string | null }[] } | null;
  fingerprint?: string | null;
}

const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");
const num = (value: number | null | undefined) => (value == null ? "—" : String(Number(value.toFixed(1))));
const ordinal = (n: number) => { const r = n % 100; const s = r >= 11 && r <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"; return `${n}${s}`; };

const BANNER = {
  VALID: { icon: ShieldCheck, tone: "border-success/30 bg-success/10 text-success", title: "This report is genuine", body: "It was issued by the school and its content has not been changed since. Compare what is shown here with your copy." },
  SUPERSEDED: { icon: ShieldAlert, tone: "border-warning/30 bg-warning/10 text-warning", title: "This report is no longer current", body: "The school has withdrawn or replaced it. Do not rely on this copy. Ask the school for the current report." },
  FAILED_INTEGRITY: { icon: ShieldX, tone: "border-destructive/30 bg-destructive/10 text-destructive", title: "This report could not be confirmed", body: "The stored record failed its integrity check. Do not rely on this copy and contact the school." },
  NOT_FOUND: { icon: ShieldX, tone: "border-destructive/30 bg-destructive/10 text-destructive", title: "No matching report found", body: "The link or code does not match any report issued by a school on SchoolHub. Check that you scanned the whole QR code or typed the code exactly as printed, or contact the school." },
} as const;

function VerifyReportPage() {
  const { id, code } = Route.useParams();
  const check = useQuery({
    queryKey: ["report-verification", id, code],
    queryFn: () => apiFetch<Verification>(`/report-verification/${encodeURIComponent(id)}/${encodeURIComponent(code)}`),
    retry: false,
  });
  const data = check.data;
  const banner = data ? BANNER[data.status] : null;
  const Icon = banner?.icon;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><GraduationCap className="size-6" />SchoolHub · Report verification</div>

        {check.isLoading && <p className="text-sm text-muted-foreground">Checking this report…</p>}
        {check.isError && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-semibold">The check could not be completed.</p>
              <p className="mt-1 text-xs text-muted-foreground">{(check.error as Error).message || "Try again in a moment."}</p>
              <button type="button" onClick={() => void check.refetch()} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Try again</button>
            </div>
          </div>
        )}

        {data && banner && Icon && (
          <>
            <div role="status" className={`flex items-start gap-3 rounded-2xl border p-5 ${banner.tone}`}>
              <Icon className="mt-0.5 size-6 shrink-0" />
              <div>
                <h1 className="text-lg font-bold">{banner.title}</h1>
                <p className="mt-1 text-sm text-foreground/80">{banner.body}</p>
              </div>
            </div>

            {data.student && (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.school}</p>
                <h2 className="mt-1 text-xl font-bold">{data.student.name}</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Admission number</dt><dd>{data.student.admissionNumber ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Class</dt><dd>{data.student.className ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Report</dt><dd>{data.assessment} · {data.year} · {data.term}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Version / published</dt><dd>{data.version} · {date(data.publishedAt)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Class teacher</dt><dd>{data.approvals?.teacher.name ?? "—"} · {date(data.approvals?.teacher.at)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Headteacher</dt><dd>{data.approvals?.head.name ?? "—"} · {date(data.approvals?.head.at)}</dd></div>
                </dl>
              </section>
            )}

            {data.results && (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-bold">Results on record</h2>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">These must match the marks and grades on the printed report.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Subject</th><th className="py-2 pr-4">Total score</th><th className="py-2">Grade</th></tr></thead>
                    <tbody>{data.results.subjects.map((row) => (
                      <tr key={row.name} className="border-b border-border/60"><td className="py-2 pr-4 font-medium">{row.name}</td><td className="py-2 pr-4 tabular-nums">{num(row.total)}</td><td className="py-2">{row.grade ?? "—"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm">
                  Average <strong className="tabular-nums">{num(data.results.average)}%</strong>
                  {data.results.position != null && <> · Position <strong>{ordinal(data.results.position)}</strong>{data.results.classSize ? ` of ${data.results.classSize}` : ""}</>}
                </p>
              </section>
            )}

            {data.fingerprint && (
              <p className="break-all text-[11px] leading-5 text-muted-foreground">Record fingerprint (SHA-256): {data.fingerprint}</p>
            )}
          </>
        )}
        <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          This page checks the report against the school's own record. It confirms authenticity and whether the report is still current; it does not replace contacting the school for anything else.
        </p>
      </div>
    </main>
  );
}
