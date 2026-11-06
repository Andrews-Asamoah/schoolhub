import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PortalWorkQueue as WorkQueue } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";

const titles: Record<string,string>={owner:"School work and approvals",admin:"School data-quality checks",headteacher:"Academic leadership inbox",teacher:"Your teaching week",student:"Your upcoming work"};
export function PortalWorkQueue() {
  const {activeRole}=useSchoolRole();
  const query=useQuery({queryKey:["dashboard","work-queue",activeRole],queryFn:()=>apiFetch<WorkQueue>("/dashboard/work-queue"),enabled:!!activeRole&&!!titles[activeRole],retry:false,refetchInterval:60000});
  if(!activeRole||!titles[activeRole])return null;
  return <section className="my-5 space-y-4 rounded-2xl border border-border bg-card p-5" aria-label={titles[activeRole]}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{titles[activeRole]}</h2><p className="mt-1 text-xs text-muted-foreground">{query.data?.term?.name??"No current academic term"} · {activeRole==="teacher"?"Your assigned teaching areas and class registers":"Actions from saved school records"}</p></div><button type="button" onClick={()=>void query.refetch()} disabled={query.isFetching} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Refresh work queue</button></div>
    {query.isPending?<p role="status" className="text-sm text-muted-foreground">Loading your work queue…</p>:query.isError?<p role="alert" className="text-sm text-destructive">The work queue could not load. Use Refresh work queue to retry.</p>:<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{query.data?.items.map(item=><Link key={item.id} to="/$page" params={{page:item.page}} className="rounded-xl border border-border p-4 transition hover:bg-muted/50"><p className="text-2xl font-bold">{item.count}</p><h3 className="mt-1 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></Link>)}</div>
      {query.data?.items.length===0&&<p className="text-sm text-muted-foreground">No work items are available for the current academic context.</p>}
      {!!query.data?.lessons.length&&<div className="overflow-x-auto"><h3 className="mb-2 text-sm font-semibold">Weekly assigned lessons</h3><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Day</th><th className="p-2">Time</th><th className="p-2">Class</th><th className="p-2">Subject</th></tr></thead><tbody>{query.data.lessons.map(row=><tr key={row.id} className="border-t border-border"><td className="p-2">{row.day}</td><td className="whitespace-nowrap p-2">{row.start}–{row.end}</td><td className="p-2">{row.className}</td><td className="p-2">{row.subject}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-muted-foreground">Recurring weekly allocation, up to 100 lessons. Check the school calendar for closures.</p></div>}
      {!!query.data?.upcoming.length&&<div><h3 className="mb-2 text-sm font-semibold">Assignments and feedback</h3><ul className="divide-y divide-border">{query.data.upcoming.map(task=><li key={task.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><Link to="/$page" params={{page:"assignments"}} className="font-medium underline">{task.title}</Link><span className="text-xs text-muted-foreground">{task.status.replaceAll("_"," ")} · {task.dueAt?new Intl.DateTimeFormat("en-GH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(task.dueAt)):"No deadline"}</span></li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Up to 100 assignments are shown; open Assignments for all current-term work.</p></div>}
      {query.data?.generatedAt&&<p className="text-xs text-muted-foreground">Checked {new Date(query.data.generatedAt).toLocaleTimeString()} · automatically refreshes every minute</p>}
    </>}
  </section>;
}
