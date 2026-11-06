import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, errorText } from "@/lib/api";
import { DeletionImpactSummary } from "@/components/school/deletion-impact-summary";
import { formatRequestDate, type DeletionImpact, type DeletionRequest } from "@/lib/student-deletion";

/**
 * For wrongly created students: ask the platform administrator to remove the
 * record permanently. The school cannot do this itself.
 */
export function StudentDeletionPanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const requests = useQuery({
    queryKey: ["student-deletion", studentId],
    queryFn: () => apiFetch<DeletionRequest[]>(`/student-deletion-requests?studentId=${encodeURIComponent(studentId)}`),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`/student-deletion-requests/${id}`, { method: "DELETE" }),
    onSuccess: () => { setCancelling(false); void queryClient.invalidateQueries({ queryKey: ["student-deletion", studentId] }); },
  });

  const latest = requests.data?.[0];
  const pending = latest?.status === "PENDING" ? latest : null;

  return (
    <section aria-label="Permanent deletion" className="mt-4 rounded-xl border border-destructive/30 bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Created by mistake?</h3>
      {pending ? (
        <div className="mt-2 space-y-2 text-sm">
          <p role="status" className="text-muted-foreground">
            Deletion requested on {formatRequestDate(pending.createdAt)} by {pending.requestedByName}. It is waiting for the platform administrator.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setCancelling(true)}>Cancel request</Button>
          {cancel.error && <p role="alert" className="text-xs text-destructive">{errorText(cancel.error)}</p>}
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          {latest?.status === "REJECTED" && (
            <p role="status" className="rounded-lg bg-muted p-2 text-xs">
              Your last request was declined{latest.decisionNote ? `: ${latest.decisionNote}` : "."}
            </p>
          )}
          <p>If this student record was added by mistake, you can ask the platform administrator to delete it permanently. Students who have fee or exam records are withdrawn instead.</p>
          <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
            <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />Request permanent deletion
          </Button>
        </div>
      )}
      {open && <RequestDialog studentId={studentId} studentName={studentName} onClose={() => setOpen(false)} />}
      <ConfirmDialog open={cancelling} title="Cancel this request?"
        description="The student record stays as it is. You can send a new request later."
        confirmLabel="Cancel request" cancelLabel="Keep request" loading={cancel.isPending}
        onConfirm={() => pending && cancel.mutate(pending.id)} onCancel={() => setCancelling(false)} />
    </section>
  );
}

function RequestDialog({ studentId, studentName, onClose }: { studentId: string; studentName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const impact = useQuery({
    queryKey: ["student-deletion", "impact", studentId],
    queryFn: () => apiFetch<DeletionImpact>(`/student-deletion-requests/impact/${encodeURIComponent(studentId)}`),
    retry: false,
  });
  const send = useMutation({
    mutationFn: () => apiFetch("/student-deletion-requests", { method: "POST", body: JSON.stringify({ studentId, reason }) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["student-deletion", studentId] }); onClose(); },
  });
  const blocked = impact.data ? !impact.data.canDelete : false;
  const ready = !!impact.data && !blocked && reason.trim().length >= 10;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="deletion-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h2 id="deletion-title" className="text-base font-bold text-foreground">Request permanent deletion of {studentName}</h2>
        <p className="mt-2 text-sm text-muted-foreground">The platform administrator reviews this request. Once approved, the record cannot be recovered.</p>

        {impact.isPending && <p className="mt-3 text-sm text-muted-foreground">Checking what would be removed…</p>}
        {impact.error && <p role="alert" className="mt-3 text-sm text-destructive">{errorText(impact.error)}</p>}
        {impact.data && (
          <div className="mt-3">
            <DeletionImpactSummary impact={impact.data} heading="This will remove:"
              blockedMessage={(blockers) => `This student has ${blockers}, so the record cannot be deleted. Withdraw the student instead.`} />
          </div>
        )}

        <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="deletion-reason">Why should it be removed?</label>
        <textarea id="deletion-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000}
          className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-sm" placeholder="For example: registered twice by mistake." />
        {send.error && <p role="alert" className="mt-2 text-sm text-destructive">{errorText(send.error)}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={send.isPending}>Close</Button>
          <Button type="button" variant="destructive" disabled={!ready} loading={send.isPending} onClick={() => send.mutate()}>Send request</Button>
        </div>
      </div>
    </div>
  );
}
