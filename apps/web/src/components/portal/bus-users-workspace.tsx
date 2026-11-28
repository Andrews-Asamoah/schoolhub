import { toast } from "@/components/ui/toaster";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BusFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabeledField, labeledInputClasses } from "@/components/forms/labeled-controls";
import { FinanceReadOnlyNotice, useFinanceAccess } from "./finance-access";
import { apiFetch } from "@/lib/api";

type BusStatus = "RIDING" | "PAUSED" | "STOPPED";
type Rider = { id: string; name: string; reference: string; busStatus: BusStatus };
type Term = { id: string; name: string; isCurrent: boolean };
type Year = { id: string; name: string; isCurrent: boolean; terms: Term[] };
type FeeStructure = { id: string; name: string; items: { id: string; name: string; isOptional: boolean; followsBusRoster: boolean }[] };

const labels: Record<BusStatus, string> = { RIDING: "Riding", PAUSED: "Paused this term", STOPPED: "Not riding" };

export function BusUsersWorkspace() {
  const { canWrite } = useFinanceAccess();
  const client = useQueryClient();
  const [selectedTerm, setSelectedTerm] = useState("");
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [action, setAction] = useState<BusStatus | "INHERIT">("RIDING");


  const years = useQuery({ queryKey: ["schools", "academic-years"], queryFn: () => apiFetch<Year[]>("/schools/academic-years") });
  const classes = useQuery({ queryKey: ["academics", "classes"], queryFn: () => apiFetch<{ id: string; name: string; academicYearId?: string | null }[]>("/academics/classes") });
  const terms = (years.data ?? []).flatMap(year => year.terms.map(term => ({ ...term, yearId: year.id, label: `${year.name} · ${term.name}` })));
  const term = terms.find(term => term.id === selectedTerm) ?? terms.find(term => term.isCurrent) ?? terms[0];
  const termId = term?.id ?? "";
  const classOptions = (classes.data ?? []).filter(item => !item.academicYearId || item.academicYearId === term?.yearId);
  const roster = useQuery({
    queryKey: ["finance", "bus-users", classId, termId],
    queryFn: ({ signal }) => apiFetch<Rider[]>(`/finance/bus-users/${encodeURIComponent(classId)}/${encodeURIComponent(termId)}`, { signal }),
    enabled: Boolean(classId && termId),
  });
  const fees = useQuery({
    queryKey: ["finance", "bus-fees"],
    queryFn: () => apiFetch<FeeStructure[]>("/finance/fee-structures"),
  });

  const save = useMutation({
    mutationFn: () => apiFetch<{ count: number }>("/finance/bus-users", {
      method: "PUT", body: JSON.stringify({ termId, studentIds: selection, status: action }),
    }),
    onSuccess: async ({ count }) => {
      setSelection([]);
      toast.success(`Updated ${count} rider record(s).`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["finance", "bus-users"] }),
        client.invalidateQueries({ queryKey: ["finance", "billing-roster"] }),
      ]);
    },
  });
  const linkFee = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/finance/bus-fees/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["finance", "bus-fees"] }),
        client.invalidateQueries({ queryKey: ["finance", "fee-structures"] }),
      ]);
    },
  });
  const students = roster.data ?? [];
  const visible = students.filter(student => `${student.name} ${student.reference}`.toLowerCase().includes(search.trim().toLowerCase()));
  const structures = (fees.data ?? []).filter(structure => structure.items.some(item => item.isOptional));

  function resetSelection() {
    setSelection([]);

    save.reset();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BusFront className="size-5" aria-hidden /></span>
            <div>
              <h1 className="text-xl font-bold text-foreground">Bus users</h1>
              <p className="mt-1 text-sm text-muted-foreground">Manage riders and link optional bus fees to the term roster.</p>
            </div>
          </div>
          <Button variant="outline" asChild><Link to="/$page" params={{ page: "invoices" }}>View invoices</Link></Button>
        </div>
      </section>
      {!canWrite && <FinanceReadOnlyNotice />}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div>
          <h2 className="font-semibold text-foreground">Term roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">Riders carry forward. A term pause skips that term and restores the previous riding status afterward.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledField label="Term">
            <select aria-label="Term" className={labeledInputClasses} value={termId} disabled={save.isPending}
              onChange={event => { setSelectedTerm(event.target.value); setClassId(""); resetSelection(); }}>
              {!terms.length && <option value="">No academic terms</option>}
              {terms.map(term => <option key={term.id} value={term.id}>{term.label}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="Class">
            <select aria-label="Class" className={labeledInputClasses} value={classId} disabled={!termId || save.isPending}
              onChange={event => { setClassId(event.target.value); resetSelection(); }}>
              <option value="">Choose a class</option>
              {classOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="Find student">
            <input className={labeledInputClasses} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or admission number" />
          </LabeledField>
        </div>
        {(years.error || classes.error || roster.error || save.error) && <p role="alert" className="text-sm text-destructive">{(years.error ?? classes.error ?? roster.error ?? save.error)?.message}</p>}

        {!classId ? <p className="text-sm text-muted-foreground">Choose a class to view its students.</p>
          : roster.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading roster…</p>
          : !roster.isError && (
            <>
              <p className="text-sm font-medium text-foreground">{students.filter(student => student.busStatus === "RIDING").length} riding this term</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table scroll={false} className="w-full text-left text-sm">
                  <TableHeader className="bg-muted/50 text-muted-foreground"><TableRow>
                    {canWrite && <TableHead><span className="sr-only">Select</span></TableHead>}
                    <TableHead>Student</TableHead><TableHead>Bus status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {!visible.length && <TableRow><TableCell className="text-muted-foreground" colSpan={canWrite ? 3 : 2}>No matching students.</TableCell></TableRow>}
                    {visible.map(student => <TableRow key={student.id} className="border-t border-border">
                      {canWrite && <TableCell className="w-10"><input type="checkbox" className="size-4 accent-primary"
                        aria-label={`Select ${student.name} (${student.reference})`} checked={selection.includes(student.id)}
                        disabled={save.isPending || (selection.length === 100 && !selection.includes(student.id))}
                        onChange={event => setSelection(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))} /></TableCell>}
                      <TableCell><p className="font-medium text-foreground">{student.name}</p><p className="text-xs text-muted-foreground">{student.reference}</p></TableCell>
                      <TableCell>{labels[student.busStatus]}</TableCell>
                    </TableRow>)}
                  </TableBody>
                </Table>
              </div>
              {canWrite && <div className="flex flex-wrap items-end gap-3">
                <LabeledField label="Update selected students">
                  <select aria-label="Update selected students" className={labeledInputClasses} value={action} onChange={event => setAction(event.target.value as typeof action)} disabled={save.isPending}>
                    <option value="RIDING">Ride from this term</option>
                    <option value="PAUSED">Pause for this term</option>
                    <option value="STOPPED">Stop from this term</option>
                    <option value="INHERIT">Restore carried-forward status</option>
                  </select>
                </LabeledField>
                <Button type="button" disabled={!selection.length} loading={save.isPending} onClick={() => save.mutate()}>Apply to {selection.length} selected</Button>
              </div>}
            </>
          )}
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-foreground">Linked optional fees</h2>
        <p className="text-sm text-muted-foreground">Link the bus item in each fee structure. New invoices will add it automatically for riders. Issued invoices keep their saved charges.</p>
        {(fees.error || linkFee.error) && <p role="alert" className="text-sm text-destructive">{(fees.error ?? linkFee.error)?.message}</p>}
        {fees.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading fee structures…</p>
          : !structures.length ? <p className="text-sm text-muted-foreground">Create an optional bus item in <Link to="/$page" params={{ page: "fees" }} className="text-primary underline">Fee structures</Link> to link it here.</p>
          : structures.map(structure => (
            <details key={structure.id} className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">{structure.name} · {structure.items.filter(item => item.followsBusRoster).length} linked</summary>
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                {structure.items.filter(item => item.isOptional).map(item => <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={item.followsBusRoster} disabled={!canWrite || linkFee.isPending}
                    onChange={event => linkFee.mutate({ id: item.id, enabled: event.target.checked })} /> {item.name}
                </label>)}
              </div>
            </details>
          ))}
      </section>
    </div>
  );
}
