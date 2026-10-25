import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2024, month, 1)),
);
const toIso = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseIso = (value: string): Date | null => {
  const parts = value.split("-");
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
  minDate?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  markedDates?: string[];
}

/** Reusable themed date picker with a custom calendar and Radix month/year selectors. */
export function DatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  disabled = false,
  className = "",
  placeholder = "Choose date",
  ariaLabel = "Choose date",
  markedDates = [],
}: DatePickerProps) {
  const selected = value ? parseIso(value) : null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? (maxDate ? parseIso(maxDate) : null) ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const max = maxDate ? parseIso(maxDate) : null;
  const min = minDate ? parseIso(minDate) : null;

  useEffect(() => {
    if (selected) setView(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const years = useMemo(() => {
    const currentYear = (max ?? new Date()).getFullYear();
    const firstYear = (min ?? new Date(currentYear - 10, 0, 1)).getFullYear();
    const lastYear = currentYear + (max ? 0 : 10);
    return Array.from({ length: Math.max(1, lastYear - firstYear + 1) }, (_, index) => firstYear + index);
  }, [maxDate, minDate]);

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const canMovePrevious = !min || new Date(year, month, 1) > new Date(min.getFullYear(), min.getMonth(), 1);
  const canMoveNext = !max || new Date(year, month + 1, 1) <= new Date(max.getFullYear(), max.getMonth(), 1);

  const chooseDay = (day: number) => {
    const next = new Date(year, month, day);
    if ((min && next < min) || (max && next > max)) return;
    onChange(toIso(next));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3.5 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-primary" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute right-0 z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={!canMovePrevious}
              onClick={() => setView(new Date(year, month - 1, 1))}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30"
            ><ChevronLeft className="size-4" /></button>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
              <Select value={String(month)} onValueChange={(value) => setView(new Date(year, Number(value), 1))}>
                <SelectTrigger aria-label="Month" className="min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(value) => setView(new Date(Number(value), month, 1))}>
                <SelectTrigger aria-label="Year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              aria-label="Next month"
              disabled={!canMoveNext}
              onClick={() => setView(new Date(year, month + 1, 1))}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-30"
            ><ChevronRight className="size-4" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-2 text-xs font-semibold text-muted-foreground">{day}</span>
            ))}
            {cells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const date = new Date(year, month, day);
              const iso = toIso(date);
              const isSelected = iso === value;
              const isToday = iso === toIso(new Date());
              const isMarked = markedDates.includes(iso);
              const outOfRange = Boolean((min && date < min) || (max && date > max));
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={outOfRange}
                  aria-pressed={isSelected}
                  aria-label={date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  onClick={() => chooseDay(day)}
                  className={`flex aspect-square items-center justify-center rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-25 ${
                    isSelected ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                      : isMarked ? "bg-success/15 font-semibold text-success ring-1 ring-success/30 hover:bg-success/25"
                        : isToday ? "border border-primary/50 font-semibold text-primary"
                          : "text-foreground hover:bg-muted"
                  }`}
                >{day}</button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success" /> Attendance recorded</span>
            <button
              type="button"
              onClick={() => { const today = toIso(new Date()); if ((!min || today >= minDate!) && (!max || today <= maxDate!)) { onChange(today); setOpen(false); } }}
              disabled={Boolean((minDate && toIso(new Date()) < minDate) || (maxDate && toIso(new Date()) > maxDate))}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
            >Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
