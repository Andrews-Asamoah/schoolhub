import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";

type HeadRow = {
  id: string;
  student: { profile: { firstName: string; lastName: string } };
  version?: { id: string; stage: string; version: number; teacherName: string | null;
    teacherRemark: string | null; headName: string | null; headRemark: string | null } | null;
};

export function HeadteacherReportApprovals({ setId, reports }: {setId: string; reports: HeadRow[]}) {
  const {activeRole} = useSchoolRole();
  const qc = useQueryClient();
  const [remarks,setRemarks] = useState<Record<string,string>>({});
  const mutation = useMutation({
    mutationFn: ({id,remark}:{id:string;remark:string}) =>
      apiFetch("/assessments/report-cards/versions/" + encodeURIComponent(id) + "/head-approve", {
        method:"PATCH",body:JSON.stringify({remark}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({queryKey:["assessments","report-cards","review",setId]});
      await qc.invalidateQueries({queryKey:["assessments","report-cards","workspace"]});
    },
  });
  const approved = reports.filter(r=>r.version?.stage==="APPROVED"||r.version?.stage==="PUBLISHED").length;
  return <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <h4 className="text-sm font-bold">Per-student academic approvals · {approved} / {reports.length}</h4>
    <p className="text-xs text-muted-foreground">
      Class teachers submit recommendations on their Assessments page. The headteacher
      independently approves each pupil and records a separate recommendation. A batch
      cannot be marked reviewed or published until all pupils are approved.
    </p>
    <div className="grid gap-3 lg:grid-cols-2">{reports.map(row=><div key={row.id}
      className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{row.student.profile.firstName} {row.student.profile.lastName}</span>
        <span className="text-xs text-muted-foreground">{row.version?.stage ?? "No version"}</span>
      </div>
      {row.version?.teacherRemark && <p className="text-xs text-muted-foreground">
        Class teacher ({row.version.teacherName ?? "Unknown"}): {row.version.teacherRemark}</p>}
      {activeRole === "headteacher" && row.version?.stage === "TEACHER_REVIEWED" && <>
        <textarea rows={2} maxLength={2000} aria-label={`Headteacher recommendation for ${row.student.profile.firstName} ${row.student.profile.lastName}`}
          className="w-full rounded-lg border border-input bg-background p-2 text-sm"
          value={remarks[row.version.id] ?? ""}
          onChange={e=>setRemarks(prev=>({...prev,[row.version!.id]:e.target.value}))}
          placeholder="Headteacher recommendation and conclusion"/>
        <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
          disabled={mutation.isPending || (remarks[row.version.id]??"").trim().length<10}
          onClick={()=>mutation.mutate({id:row.version!.id,remark:(remarks[row.version!.id]??"").trim()})}>
          {mutation.isPending?"Approving…":"Approve pupil report"}
        </button>
      </>}
      {row.version?.headRemark && <p className="text-xs text-muted-foreground">
        Headteacher ({row.version.headName}): {row.version.headRemark}</p>}
    </div>)}</div>
    {mutation.isError&&<p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>}
  </div>;
}
