import { useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BillingStudent = { id: string; name: string; reference: string; busStatus?: "RIDING" | "PAUSED" | "STOPPED" };

export function OptionalFeeRoster({ name, amount, students, selected, onChange }: {
  name: string;
  amount: string;
  students: BillingStudent[];
  selected: string[];
  onChange: (studentIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const fieldId = useId();
  const selectedIds = new Set(selected);
  const term = search.trim().toLowerCase();
  const visible = students.filter(student => `${student.name} ${student.reference}`.toLowerCase().includes(term));
  const unselectedVisible = visible.filter(student => !selectedIds.has(student.id));

  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-foreground">
        {name} <span className="font-normal text-muted-foreground">· {amount} · {selected.length} selected</span>
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <label htmlFor={fieldId} className="sr-only">Find students for {name}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input id={fieldId} type="search" value={search} onChange={event => setSearch(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
            placeholder="Search name or admission number"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!unselectedVisible.length} onClick={() =>
            onChange([...selected, ...unselectedVisible.map(student => student.id)])}>
            Select all shown
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!selected.length}
            onClick={() => onChange([])}>Clear selection</Button>
        </div>
        {visible.length ? (
          <ul aria-label={`Students eligible for ${name}`} className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {visible.map(student => (
              <li key={student.id}>
                <label className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-muted/50">
                  <input type="checkbox" checked={selectedIds.has(student.id)} className="size-4 shrink-0 accent-primary"
                    onChange={event => onChange(event.target.checked ? [...selected, student.id] : selected.filter(id => id !== student.id))} />
                  <span className="min-w-0 text-sm text-foreground">
                    <span className="block break-words font-medium">{student.name}</span>
                    <span className="block break-words text-xs text-muted-foreground">{student.reference}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : <p role="status" className="text-sm text-muted-foreground">No students match your search.</p>}
      </div>
    </details>
  );
}
