import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type MatchChoice = { statementLineId: string; transactionId: string };
type SuggestedMatch = MatchChoice & {
  date: string;
  reference: string;
  amount: string;
  statementDescription: string;
  transactionNumber: string;
  postingDescription: string;
};

export function BankMatchSuggestions({ reconciliationId, busy, onApply }: {
  reconciliationId: string;
  busy: boolean;
  onApply: (choices: MatchChoice[]) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["reconciliations", reconciliationId, "suggested-matches"],
    queryFn: ({ signal }) => apiFetch<SuggestedMatch[]>(`/finance/reconciliations/${reconciliationId}/suggested-matches`, { signal }),
    enabled,
    retry: false,
  });
  const matches = query.data ?? [];
  const selection = new Set(selected);
  const chosen = matches.filter(match => selection.has(match.statementLineId));
  const refresh = () => {
    setSelected([]);
    if (enabled) void query.refetch();
    else setEnabled(true);
  };

  return (
    <section aria-label="Suggested bank matches" className="space-y-3 rounded-xl border border-border bg-muted/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Suggested matches</h3>
          <p className="text-sm text-muted-foreground">Find statement lines with a unique ledger posting for the same reference, date and signed amount.</p>
        </div>
        <Button type="button" variant="outline" disabled={busy || query.isFetching} onClick={refresh}>
          {query.isFetching ? "Finding matches…" : enabled ? "Refresh suggestions" : "Find exact matches"}
        </Button>
      </div>
      {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
      {query.isSuccess && !matches.length && <p role="status" className="text-sm text-muted-foreground">No exact matches found. Use manual matching for remaining lines. For future imports, map the statement’s reference column if one is available.</p>}
      {matches.length > 0 && <>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" variant="outline" disabled={busy || query.isFetching || chosen.length === matches.length}
            onClick={() => setSelected(matches.map(match => match.statementLineId))}>Select all</Button>
          <Button size="sm" type="button" variant="ghost" disabled={busy || !chosen.length} onClick={() => setSelected([])}>Clear</Button>
          <span role="status" className="text-sm text-muted-foreground">{chosen.length} of {matches.length} selected</span>
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr>
              <th scope="col" className="p-2"><span className="sr-only">Select</span></th>
              <th scope="col" className="p-2">Statement line</th>
              <th scope="col" className="p-2">Ledger posting</th>
              <th scope="col" className="p-2 text-right">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {matches.map(match => <tr key={match.statementLineId}>
                <td className="p-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={selection.has(match.statementLineId)}
                    aria-label={`Match ${match.reference} to ${match.transactionNumber}`} disabled={busy || query.isFetching}
                    onChange={event => setSelected(event.target.checked ? [...selected, match.statementLineId] : selected.filter(id => id !== match.statementLineId))} />
                </td>
                <td className="p-2"><div>{match.statementDescription}</div><div className="text-xs text-muted-foreground">{match.date.slice(0, 10)} · {match.reference}</div></td>
                <td className="p-2"><div>{match.postingDescription}</div><div className="text-xs text-muted-foreground">{match.transactionNumber}</div></td>
                <td className="whitespace-nowrap p-2 text-right tabular-nums">{match.amount}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <Button type="button" disabled={busy || query.isFetching || !query.isSuccess || !chosen.length}
          onClick={() => onApply(chosen.map(({ statementLineId, transactionId }) => ({ statementLineId, transactionId })))}>
          Save {chosen.length || ""} selected {chosen.length === 1 ? "match" : "matches"}
        </Button>
      </>}
    </section>
  );
}
