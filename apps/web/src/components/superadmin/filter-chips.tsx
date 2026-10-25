import { cn } from "@/lib/utils";

interface FilterChipsProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}

/** Single-select pill filter (accessible as a radio group). */
export function FilterChips<T extends string>({ label, value, options, onChange }: FilterChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}>
            {option.label}
            {option.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", selected ? "bg-primary-foreground/20" : "bg-muted")}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
