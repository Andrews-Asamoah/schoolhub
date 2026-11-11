import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, FolderArchive } from "lucide-react";
import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/components/superadmin/use-debounced-value";
import { apiFetch, downloadAcademicReport, errorText } from "@/lib/api";

type ArchiveItem = {
  id: string; pupilName: string; admissionNumber: string | null; className: string | null;
  setName: string; academicYear: string; term: string; publishedAt: string | null;
  version: number | null; hasPdf: boolean;
};
type ArchivePage = { items: ArchiveItem[]; total: number; page: number; pageSize: number };
type ArchiveFilters = {
  years: { id: string; name: string; terms: { id: string; name: string }[] }[];
  classes: { id: string; name: string }[];
};

const BASE = "/assessments/report-cards/archive";
const PAGE_SIZE = 25;

export function archiveQueryString(filters: { page: number; q: string; yearId: string; termId: string; classId: string }) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(PAGE_SIZE) });
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.yearId) params.set("academicYearId", filters.yearId);
  if (filters.termId) params.set("termId", filters.termId);
  if (filters.classId) params.set("classId", filters.classId);
  return params.toString();
}

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const safeFileName = (item: ArchiveItem) =>
  `${item.pupilName}-${item.academicYear}-${item.term}-report`.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase() + ".pdf";

/**
 * Published report cards across every year and term, for staff. The server decides what each person may
 * see (a teacher only gets pupils in classes they teach) and records each PDF opened in the audit trail,
 * so this page only asks and displays. Reports issued before versioned PDFs exist show "No PDF available".
 */
export function ReportCardArchiveWorkspace({ role }: { role?: string }) {
  const [search, setSearch] = useState("");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const q = useDebouncedValue(search, 300);

  // Any change to what is being looked for starts again from the first page.
  useEffect(() => { setPage(1); }, [q, yearId, termId, classId]);

  const filters = useQuery({
    queryKey: ["assessments", "report-cards", "archive-filters"],
    queryFn: () => apiFetch<ArchiveFilters>(`${BASE}/filters`),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const archive = useQuery({
    queryKey: ["assessments", "report-cards", "archive", { page, q, yearId, termId, classId }],
    queryFn: () => apiFetch<ArchivePage>(`${BASE}?${archiveQueryString({ page, q, yearId, termId, classId })}`),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const terms = filters.data?.years.find((year) => year.id === yearId)?.terms
    ?? [...new Map((filters.data?.years ?? []).flatMap((year) => year.terms).map((term) => [term.id, term])).values()];
  const data = archive.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstShown = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastShown = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const filtering = !!(q.trim() || yearId || termId || classId);

  const open = async (item: ArchiveItem) => {
    setOpening((prev) => ({ ...prev, [item.id]: true }));
    setErrors((prev) => ({ ...prev, [item.id]: undefined }));
    try {
      await downloadAcademicReport(`${BASE}/${encodeURIComponent(item.id)}/pdf`, safeFileName(item));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [item.id]: errorText(error, "The PDF could not be opened.") }));
    } finally {
      setOpening((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const select = "h-9 rounded-lg border border-input bg-background px-2 text-sm";
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div>
      <h2 className="flex items-center gap-2 text-base font-bold"><FolderArchive className="size-5 text-primary" /> Report card archive</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {role === "teacher"
          ? "Published report cards for pupils currently in classes you teach, from every year and term."
          : "Published report cards for every pupil, from every year and term."}
        {" "}Opening a report card is recorded in the audit trail.
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or admission number" aria-label="Search pupils"
        className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm" />
      <select value={yearId} aria-label="Academic year" className={select}
        onChange={(event) => { setYearId(event.target.value); setTermId(""); }}>
        <option value="">All years</option>
        {(filters.data?.years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
      </select>
      <select value={termId} aria-label="Term" className={select} onChange={(event) => setTermId(event.target.value)}>
        <option value="">All terms</option>
        {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
      </select>
      <select value={classId} aria-label="Class when the report was issued" className={select} onChange={(event) => setClassId(event.target.value)}>
        <option value="">All classes</option>
        {(filters.data?.classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {filtering && <button type="button" className="text-xs font-bold text-primary underline"
        onClick={() => { setSearch(""); setYearId(""); setTermId(""); setClassId(""); }}>Clear filters</button>}
    </div>

    {archive.isPending && <p className="text-sm text-muted-foreground">Loading report cards…</p>}
    {archive.isError && <p role="alert" className="text-sm text-destructive">{errorText(archive.error, "The archive could not be loaded.")}</p>}
    {data && data.total === 0 && <p className="text-sm text-muted-foreground">
      {filtering ? "No published report cards match these filters." : "No report cards have been published yet."}
    </p>}

    {data && data.items.length > 0 && <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pupil</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Report</TableHead>
            <TableHead>Published</TableHead>
            <TableHead className="w-48"><span className="sr-only">Report card</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => <TableRow key={item.id}>
            <TableCell className="align-top">
              <span className="block text-sm font-semibold">{item.pupilName}</span>
              <span className="block text-xs text-muted-foreground">{item.admissionNumber ?? "No admission number"}</span>
            </TableCell>
            <TableCell className="align-top text-sm">{item.className ?? "—"}</TableCell>
            <TableCell className="align-top text-sm">
              <span className="block">{item.setName}</span>
              <span className="block text-xs text-muted-foreground">{item.academicYear} · {item.term}</span>
            </TableCell>
            <TableCell className="align-top text-sm">{dateLabel(item.publishedAt)}</TableCell>
            <TableCell className="align-top">
              {item.hasPdf
                ? <button type="button" onClick={() => void open(item)} disabled={opening[item.id]}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
                    <Download className="size-3.5" /> {opening[item.id] ? "Opening…" : "Download PDF"}
                  </button>
                : <span className="text-xs text-muted-foreground"
                    title="This report was issued before signed PDFs were kept, so there is no PDF to open.">
                    No PDF available
                  </span>}
              {errors[item.id] && <p role="alert" className="mt-1 text-xs text-destructive">{errors[item.id]}</p>}
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span role="status">Showing {firstShown}–{lastShown} of {data.total}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={data.page <= 1 || archive.isFetching} onClick={() => setPage(data.page - 1)}
            className="rounded-lg border border-border px-3 py-1.5 font-bold disabled:opacity-40">Previous</button>
          <span>Page {data.page} of {totalPages}</span>
          <button type="button" disabled={data.page >= totalPages || archive.isFetching} onClick={() => setPage(data.page + 1)}
            className="rounded-lg border border-border px-3 py-1.5 font-bold disabled:opacity-40">Next</button>
        </div>
      </div>
    </>}
  </section>;
}
