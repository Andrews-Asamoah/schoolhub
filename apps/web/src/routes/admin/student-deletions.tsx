import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, UserX } from "lucide-react";
import { apiFetch, errorText } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/superadmin/page-header";
import { FilterChips } from "@/components/superadmin/filter-chips";
import { Pagination } from "@/components/superadmin/pagination";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";
import { DeletionImpactSummary } from "@/components/school/deletion-impact-summary";
import { formatRequestDate, type DeletionImpact, type DeletionStatus, type PlatformDeletionRequest } from "@/lib/student-deletion";

export const Route = createFileRoute("/admin/student-deletions")({
  component: StudentDeletionsPage,
});

interface ListResponse {
  data: PlatformDeletionRequest[];
  pending: number;
  meta: { total: number; page: number; limit: number; totalPages: number };
}
type ImpactResponse = DeletionImpact | { alreadyHandled: true } | { studentRemoved: true; alreadyHandled: false };
type Filter = "PENDING" | "all" | DeletionStatus;

const LIMIT = 20;

function StudentDeletionsPage() {
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["superadmin", "student-deletions", filter, page],
    queryFn: () => apiFetch<ListResponse>(`/super-admin/student-deletion-requests?page=${page}&limit=${LIMIT}${filter === "all" ? "" : `&status=${filter}`}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Platform management" title="Student deletion requests"
        description="Schools ask here to permanently remove a student record that was created by mistake. Approving deletes it for good." />
      <FilterChips label="Filter by status" value={filter}
        onChange={(value) => { setFilter(value); setPage(1); }}
        options={[
          { value: "PENDING", label: "Waiting", count: list.data?.pending },
          { value: "APPROVED", label: "Deleted" },
          { value: "REJECTED", label: "Declined" },
          { value: "all", label: "All" },
        ]} />
      {list.isPending ? <LoadingPanel label="Loading requests…" />
        : list.error ? <ErrorPanel message={errorText(list.error)} onRetry={() => void list.refetch()} />
        : list.data.data.length === 0 ? <EmptyPanel title="Nothing here" description="No deletion requests match this filter." icon={<UserX className="size-6" />} />
        : (
          <>
            <ul className="space-y-3">
              {list.data.data.map((request) => <RequestCard key={request.id} request={request} />)}
            </ul>
            <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} limit={LIMIT} onChange={setPage} />
          </>
        )}
    </div>
  );
}

function RequestCard({ request }: { request: PlatformDeletionRequest }) {
  const queryClient = useQueryClient();
  const pending = request.status === "PENDING";
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const impact = useQuery({
    queryKey: ["superadmin", "student-deletions", "impact", request.id],
    queryFn: () => apiFetch<ImpactResponse>(`/super-admin/student-deletion-requests/${request.id}/impact`),
    enabled: pending,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const done = () => void queryClient.invalidateQueries({ queryKey: ["superadmin", "student-deletions"] });
  const approve = useMutation({
    mutationFn: () => apiFetch(`/super-admin/student-deletion-requests/${request.id}/approve`, { method: "POST" }),
    onSuccess: () => { setConfirming(false); done(); },
    onError: () => setConfirming(false),
  });
  const reject = useMutation({
    mutationFn: () => apiFetch(`/super-admin/student-deletion-requests/${request.id}/reject`, { method: "POST", body: JSON.stringify({ decisionNote: note }) }),
    onSuccess: () => { setRejecting(false); setNote(""); done(); },
  });

  const detail = impact.data && "student" in impact.data ? impact.data : null;
  const blocked = detail ? !detail.canDelete : false;
  const studentGone = impact.data && "studentRemoved" in impact.data && impact.data.studentRemoved;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {request.studentName}{request.admissionNumber ? ` · ${request.admissionNumber}` : ""}{request.className ? ` · ${request.className}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{request.school.name} · requested by {request.requestedByName} on {formatRequestDate(request.createdAt)}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
          {request.status === "APPROVED" ? "Deleted" : request.status === "REJECTED" ? "Declined" : request.status === "CANCELLED" ? "Cancelled" : "Waiting"}
        </span>
      </div>
      <p className="mt-3 text-sm text-foreground"><span className="font-medium">Reason: </span>{request.reason}</p>

      {pending && (
        <div className="mt-3 text-sm">
          {impact.isPending && <p className="text-muted-foreground">Checking what would be removed…</p>}
          {impact.error && <p role="alert" className="text-destructive">{errorText(impact.error)}</p>}
          {studentGone && <p className="text-muted-foreground">This student is already gone. Approving simply closes the request.</p>}
          {detail && (
            <DeletionImpactSummary impact={detail} heading="Approving permanently removes:"
              blockedMessage={(blockers) => `This student now has ${blockers}, so it cannot be deleted. Decline the request and ask the school to withdraw the student.`} />
          )}
          {(approve.error || reject.error) && <p role="alert" className="mt-2 text-destructive">{errorText(approve.error ?? reject.error)}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" disabled={blocked || impact.isPending || !!impact.error} onClick={() => setConfirming(true)}>
              <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />Approve and delete
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(true)}>Decline</Button>
          </div>
        </div>
      )}

      {request.status === "APPROVED" && <p className="mt-2 text-xs text-muted-foreground">Deleted by {request.reviewedByName} on {request.reviewedAt ? formatRequestDate(request.reviewedAt) : ""}.</p>}
      {request.status === "REJECTED" && <p className="mt-2 text-xs text-muted-foreground">Declined by {request.reviewedByName}{request.decisionNote ? `: ${request.decisionNote}` : "."}</p>}

      <ConfirmDialog open={confirming} title={`Permanently delete ${request.studentName}?`}
        description="This removes the student record and everything listed above. It cannot be undone."
        confirmLabel="Delete permanently" confirmVariant="danger" loading={approve.isPending}
        onConfirm={() => approve.mutate()} onCancel={() => setConfirming(false)} />

      {rejecting && (
        <div role="dialog" aria-modal="true" aria-labelledby={`reject-${request.id}`} className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h2 id={`reject-${request.id}`} className="text-base font-bold text-foreground">Decline this request</h2>
            <p className="mt-1 text-sm text-muted-foreground">The school will see your note.</p>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} aria-label="Reason for declining"
              className="mt-3 w-full rounded-lg border border-input bg-background p-2 text-sm" />
            {reject.error && <p role="alert" className="mt-2 text-sm text-destructive">{errorText(reject.error)}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejecting(false)} disabled={reject.isPending}>Back</Button>
              <Button type="button" loading={reject.isPending} disabled={note.trim().length < 3} onClick={() => reject.mutate()}>Decline request</Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
