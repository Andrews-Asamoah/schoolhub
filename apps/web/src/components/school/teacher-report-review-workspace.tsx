import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type QueueRow = {
  id: string; stage: string; version: number; teacherRemark: string | null;
  student: { admissionNumber: string | null; profile: { firstName: string; lastName: string } };
  set: { name: string; term: { name: string } };
  subjects: { name: string; grade: string | null; percentage: number }[];
};

export function TeacherReportReviewWorkspace() {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState<Record<string,string>>({});
  const reports = useQuery({
    queryKey: ["assessments", "report-cards", "teacher-queue"],
    queryFn: () => apiFetch<QueueRow[]>("/assessments/report-cards/teacher-queue"),
    retry: false,
  });
  const approval = useMutation({
    mutationFn: ({ id, remark }: {id:string; remark:string}) =>
      apiFetch("/assessments/report-cards/versions/" + encodeURIComponent(id) + "/recommend", {
        method: "POST", body: JSON.stringify({ remark }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey:["assessments","report-cards","teacher-queue"]});
    },
  });
  return <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
    <div><h2 className="flex items-center gap-2 text-base font-bold">
      <ClipboardCheck className="size-5 text-primary"/> Class teacher report recommendations</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Review each pupil's final marks, then write your recommendation.
        Headteacher approval is a separate mandatory step before publication.
      </p>
    </div>
    {reports.isPending && <p className="text-sm text-muted-foreground">Loading reports assigned to you…</p>}
    {reports.isError && <p role="alert" className="text-sm text-destructive">{reports.error.message}</p>}
    {!reports.isPending && !reports.data?.length && <p className="text-sm text-muted-foreground">
      No generated reports require action for your assigned classes.
    </p>}
    <div className="grid gap-3 lg:grid-cols-2">{reports.data?.map(item =>
      <article key={item.id} className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold">
            {item.student.profile.firstName} {item.student.profile.lastName}</h3>
            <p className="text-xs text-muted-foreground">
              {item.student.admissionNumber ?? "No admission number"} · {item.set.name} · {item.set.term.name} · v{item.version}
            </p></div>
          <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">
            {item.stage === "GENERATED" ? "Recommendation needed" :
              item.stage === "TEACHER_REVIEWED" ? "Waiting for headteacher" : "Headteacher approved"}
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{item.subjects.map(s =>
          `${s.name}: ${s.percentage}% (${s.grade ?? "—"})`).join(" · ")}</p>
        {item.stage === "GENERATED" ? <>
          <label htmlFor={`teacher-report-${item.id}`} className="text-xs font-semibold">Recommendation</label>
          <textarea id={`teacher-report-${item.id}`} rows={3} maxLength={2000}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm"
            value={remarks[item.id] ?? ""} onChange={e=>setRemarks(prev=>({...prev,[item.id]:e.target.value}))}
            placeholder="Academic development, strengths and next steps"/>
          <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            disabled={approval.isPending || (remarks[item.id] ?? "").trim().length < 10}
            onClick={()=>approval.mutate({ id:item.id,remark:(remarks[item.id] ?? "").trim() })}>
            {approval.isPending ? "Saving…" : "Submit signed-off recommendation"}</button>
        </> : <p className="text-xs text-muted-foreground">Your recorded recommendation: {item.teacherRemark ?? "—"}</p>}
      </article>)}</div>
    {approval.isError && <p role="alert" className="text-xs text-destructive">{approval.error.message}</p>}
    {approval.isSuccess && <p role="status" className="text-xs text-success">
      Recommendation recorded. The headteacher can now review this version.</p>}
  </section>;
}
