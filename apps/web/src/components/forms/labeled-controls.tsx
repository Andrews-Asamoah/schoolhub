import type { ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";

/** Text-box style for fields whose label wraps the control (the label supplies the gap above it). */
export const labeledInputClasses =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

/** A label wrapping its control. Lighter than FormField when no id, hint or error is needed. */
export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface LabeledTextFieldProps {
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}

/** A labelled text, number or date input. Dates use the app's date picker. */
export function LabeledTextField({ label, type = "text", required = false, value, onChange }: LabeledTextFieldProps) {
  return (
    <label className="text-xs font-semibold text-foreground">
      {label}
      {required ? " *" : ""}
      {type === "date" ? (
        <DatePicker value={value} onChange={onChange} required={required} ariaLabel={label} buttonClassName={labeledInputClasses} />
      ) : (
        <input
          type={type}
          value={value}
          required={required}
          min={type === "number" ? 0 : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={labeledInputClasses}
        />
      )}
    </label>
  );
}
