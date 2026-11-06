import { blockerSentence, removalSummary, type DeletionImpact } from "@/lib/student-deletion";

interface DeletionImpactSummaryProps {
  impact: DeletionImpact;
  /** Introduces the list of what goes with the student; the school and the platform word it differently. */
  heading: string;
  /** Explains why deletion is not possible, given "3 payments and 1 fee bill". */
  blockedMessage: (blockers: string) => string;
}

/** What a permanent deletion removes, or why it is not allowed. Used by the school's request and the platform's review. */
export function DeletionImpactSummary({ impact, heading, blockedMessage }: DeletionImpactSummaryProps) {
  if (!impact.canDelete) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {blockedMessage(blockerSentence(impact.blockers))}
      </p>
    );
  }
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-sm">
      <p className="font-medium text-foreground">{heading}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
        {removalSummary(impact).map((item) => <li key={item}>{item}</li>)}
      </ul>
      {impact.guardiansKept.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Kept, because they have another child here: {impact.guardiansKept.join(", ")}.</p>
      )}
    </div>
  );
}
