import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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
  /** Controlled ISO calendar date (YYYY-MM-DD). */
  value?: string;
  /** For native FormData use, or initial state without a controlling value. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  clearable?: boolean;
  onBlur?: () => void;
  maxDate?: string;
  minDate?: string;
  /** Native min/max aliases, to ease migration from input[type=date]. */
  max?: string;
  min?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  markedDates?: string[];
}

/** Reusable themed date picker with a custom calendar and Radix month/year selectors. */
export function DatePicker({
  value,
  defaultValue = "",
  onChange,
  name,
  id,
  required = false,
  clearable = true,
  onBlur,
  maxDate,
  minDate,
  max: maxProp,
  min: minProp,
  disabled = false,
  className = "",
  buttonClassName = "",
  buttonStyle,
  placeholder = "Choose date",
  ariaLabel = "Choose date",
  markedDates = [],
}: DatePickerProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const actualValue = value ?? internalValue;
  const selected = actualValue ? parseIso(actualValue) : null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? ((maxDate ?? maxProp) ? parseIso((maxDate ?? maxProp)!) : null) ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 8, left: 8 });
  const positionPopover = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(304, window.innerWidth - 16);
    const height = Math.min(popoverRef.current?.getBoundingClientRect().height ?? 450, window.innerHeight - 16);
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const above = roomBelow < height && rect.top > roomBelow;
    setPopoverPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: above ? Math.max(8, rect.top - height - 8) : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8)),
    });
  };
  const resolvedMax = maxDate ?? maxProp;
  const resolvedMin = minDate ?? minProp;
  const max = resolvedMax ? parseIso(resolvedMax) : null;
  const min = resolvedMin ? parseIso(resolvedMin) : null;

  useEffect(() => {
    if (selected) setView(selected);
  }, [actualValue]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)
        || target.closest('[role="listbox"], [data-radix-popper-content-wrapper]')) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    positionPopover();
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", positionPopover, true);
    window.addEventListener("resize", positionPopover);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", positionPopover, true);
      window.removeEventListener("resize", positionPopover);
    };
  }, [open]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const firstYear = (min ?? new Date(1900, 0, 1)).getFullYear();
    const lastYear = (max ?? new Date(currentYear + 20, 0, 1)).getFullYear();
    return Array.from({ length: Math.max(1, lastYear - firstYear + 1) }, (_, index) => firstYear + index);
  }, [resolvedMax, resolvedMin]);

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const canMovePrevious = !min || new Date(year, month, 1) > new Date(min.getFullYear(), min.getMonth(), 1);
  const canMoveNext = !max || new Date(year, month + 1, 1) <= new Date(max.getFullYear(), max.getMonth(), 1);

  const commitDate = (iso: string) => {
    if (value === undefined) setInternalValue(iso);
    onChange?.(iso);
    setOpen(false);
    onBlur?.();
    buttonRef.current?.focus();
  };
  const chooseDay = (day: number) => {
    const next = new Date(year, month, day);
    if ((min && next < min) || (max && next > max)) return;
    commitDate(toIso(next));
  };

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      {name && <input type="hidden" name={name} value={actualValue} disabled={disabled} />}
      {required && <input
        type="text" required value={actualValue} disabled={disabled}
        tabIndex={-1} aria-hidden="true" onChange={() => undefined}
        className="pointer-events-none absolute size-px opacity-0"
        onInvalid={(event) => { event.preventDefault(); setOpen(true); buttonRef.current?.focus(); }}
      />}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-required={required}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={buttonStyle}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3.5 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${buttonClassName}`}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-primary" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose a date"
          style={{ position: "fixed", top: popoverPosition.top, left: popoverPosition.left }}
          className="z-50 max-h-[calc(100vh-1rem)] w-[min(19rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
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
              const isSelected = iso === actualValue;
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
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {markedDates.length > 0 ? (
                <><span className="size-2 rounded-full bg-success" /> Attendance recorded</>
              ) : !required && clearable && actualValue ? (
                <button type="button" className="rounded-lg px-2.5 py-1.5 hover:bg-muted hover:text-foreground"
                  onClick={() => commitDate("")}>Clear date</button>
              ) : "Select a date"}
            </span>
            <button
              type="button"
              onClick={() => { const today = toIso(new Date()); if ((!resolvedMin || today >= resolvedMin) && (!resolvedMax || today <= resolvedMax)) commitDate(today); }}
              disabled={Boolean((resolvedMin && toIso(new Date()) < resolvedMin) || (resolvedMax && toIso(new Date()) > resolvedMax))}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
            >Today</button>
          </div>
        </div>, document.body)}
    </div>
  );
}

/** Date and time selection without the browser's native date/time-date picker.
 * Preserves the HTML datetime-local format consumed by existing forms/APIs. */
export function DateTimePicker({
  value, onChange, defaultValue = "", name, id, required, disabled,
  className, buttonClassName, min, max, onBlur,
}: Pick<DatePickerProps, "value" | "onChange" | "defaultValue" | "name" | "id" |
  "required" | "disabled" | "className" | "buttonClassName" | "min" | "max" | "onBlur">) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const actualValue = value ?? internalValue;
  const [date = "", time = ""] = actualValue.split("T");
  const setDateTime = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };
  return (
    <div className={`flex min-w-0 flex-col gap-2 sm:flex-row ${className ?? ""}`}>
      <DatePicker value={date} onChange={nextDate => setDateTime(nextDate ? `${nextDate}T${time || "09:00"}` : "")}
        id={id} required={required} disabled={disabled} buttonClassName={buttonClassName}
        min={min?.slice(0, 10)} max={max?.slice(0, 10)} onBlur={onBlur}
      />
      <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="sr-only">Time</span>
        <input aria-label="Time" type="time" value={time || "09:00"} disabled={disabled}
          onBlur={onBlur} onChange={event => { if (date) setDateTime(`${date}T${event.target.value}`); }}
          className="h-11 rounded-xl border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {name && <input type="hidden" name={name} value={actualValue} disabled={disabled} />}
    </div>
  );
}
