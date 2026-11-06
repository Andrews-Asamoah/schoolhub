import { useRef } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createAcademicYearSchema,
  type CreateAcademicYearInput,
} from "@schoolhub/shared";
import {
  FormField,
  FormInput,
  FormSubmitButton,
} from "@/components/forms/form-controls";
import { apiFetch } from "@/lib/api";
import { AcademicYearCard } from "@/components/school/academic-year-card";
import { AcademicCalendarPolicyWorkspace } from "@/components/school/academic-calendar-policy-workspace";

type YearValues = Omit<CreateAcademicYearInput, "isCurrent" | "terms"> & {
  isCurrent?: boolean;
  terms?: {
    name: string;
    termNumber: number;
    startDate: string;
    endDate: string;
    isCurrent?: boolean;
  }[];
};

interface AcademicYearSetupProps {
  years: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    terms: {
      id: string;
      name: string;
      termNumber: number;
      startDate: string;
      endDate: string;
      isCurrent: boolean;
    }[];
  }[];
}

function suggestedYearName() {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

function blankTerm(termNumber: number) {
  return {
    name: `Term ${termNumber}`,
    termNumber,
    startDate: "",
    endDate: "",
    isCurrent: false,
  };
}

export function AcademicYearSetup({ years }: AcademicYearSetupProps) {
  const queryClient = useQueryClient();
  const validationSummary = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (input: CreateAcademicYearInput) =>
      apiFetch("/schools/academic-years", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schools", "academic-years"] }),
        queryClient.invalidateQueries({ queryKey: ["school", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["academics"] }),
        queryClient.invalidateQueries({ queryKey: ["schools", "academic-context"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const form = useForm({
    defaultValues: {
      name: suggestedYearName(),
      startDate: "",
      endDate: "",
      isCurrent: false,
      terms: [blankTerm(1)],
    } as YearValues,
    validators: {
      onSubmit: createAcademicYearSchema,
    },
    onSubmitInvalid: () => {
      mutation.reset();
      requestAnimationFrame(() => validationSummary.current?.focus());
    },
    onSubmit: async ({ value }) => {
      mutation.reset();
      await mutation.mutateAsync(createAcademicYearSchema.parse(value));
      form.reset({
        name: "",
        startDate: "",
        endDate: "",
        isCurrent: false,
        terms: [blankTerm(1)],
      });
    },
  });

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-card to-info/10 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                School setup · Step 1
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
                Set up the academic calendar
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Set the school-year dates and create its terms together. Classes, billing, attendance, and assessments can then be attached to the correct year and term.
              </p>
            </div>
          </div>
        </div>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit().catch(() => undefined);
          }}
          className="space-y-5 p-5 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <form.Field name="name">
              {(field) => (
                <FormField label="Academic year name" htmlFor={field.name} error={field.state.meta.errors}>
                  <FormInput
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="2026/2027"
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="startDate">
              {(field) => (
                <FormField label="Year starts" htmlFor={field.name} error={field.state.meta.errors}>
                  <DatePicker
                    id={field.name}
                    ariaLabel="Year starts"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="endDate">
              {(field) => (
                <FormField label="Year ends" htmlFor={field.name} error={field.state.meta.errors}>
                  <DatePicker
                    id={field.name}
                    ariaLabel="Year ends"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="isCurrent">
              {(field) => (
                <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-border px-3 text-xs font-medium text-foreground/80">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const isCurrent = event.target.checked;
                      field.handleChange(isCurrent);
                      if (!isCurrent) {
                        form.setFieldValue("terms", (terms) =>
                          (terms ?? []).map((term) => ({
                            ...term,
                            isCurrent: false,
                          })),
                        );
                      }
                    }}
                    className="size-4 rounded border-input accent-primary"
                  />
                  Set as current year
                </label>
              )}
            </form.Field>
          </div>

          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Terms</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Add at least one term; dates must fit inside the academic year and must not overlap.
                </p>
              </div>
              <form.Field name="terms" mode="array">
                {(field) => (
                  <button
                    type="button"
                    disabled={(field.state.value ?? []).length >= 3}
                    onClick={() => {
                      const usedNumbers = new Set(
                        (field.state.value ?? []).map((term) => term.termNumber),
                      );
                      const nextNumber = [1, 2, 3].find(
                        (number) => !usedNumbers.has(number),
                      );
                      if (nextNumber) field.pushValue(blankTerm(nextNumber));
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-card px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    Add term
                  </button>
                )}
              </form.Field>
            </div>

            <form.Field name="terms" mode="array">
              {(termsField) => (
                <div className="space-y-3">
                  {(termsField.state.value ?? []).map((term, index) => (
                    <div
                      key={`${index}-${term.termNumber}`}
                      className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_0.65fr_0.65fr_auto_auto]"
                    >
                      <form.Field name={`terms[${index}].name`}>
                        {(field) => (
                          <FormField label={`Term ${index + 1} name`} htmlFor={`term-${index}-name`} error={field.state.meta.errors}>
                            <FormInput id={`term-${index}-name`} value={field.state.value}
                              onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}
                              aria-invalid={field.state.meta.errors.length > 0}
                              aria-describedby={field.state.meta.errors.length ? `term-${index}-name-error` : undefined} />
                          </FormField>
                        )}
                      </form.Field>
                      <form.Field name={`terms[${index}].startDate`}>
                        {(field) => (
                          <FormField label="Starts" htmlFor={`term-${index}-start`} error={field.state.meta.errors}>
                            <DatePicker id={`term-${index}-start`} ariaLabel={`Term ${index + 1} starts`}
                              value={field.state.value} onBlur={field.handleBlur} onChange={field.handleChange} />
                          </FormField>
                        )}
                      </form.Field>
                      <form.Field name={`terms[${index}].endDate`}>
                        {(field) => (
                          <FormField label="Ends" htmlFor={`term-${index}-end`} error={field.state.meta.errors}>
                            <DatePicker id={`term-${index}-end`} ariaLabel={`Term ${index + 1} ends`}
                              value={field.state.value} onBlur={field.handleBlur} onChange={field.handleChange} />
                          </FormField>
                        )}
                      </form.Field>
                      <label className="flex items-center gap-2 self-end rounded-lg px-2 py-2 text-xs font-medium text-foreground/80">
                        <input
                          type="checkbox"
                          checked={term.isCurrent}
                          onChange={(event) => {
                            const isCurrent = event.target.checked;
                            if (isCurrent) {
                              form.setFieldValue("isCurrent", true);
                            }
                            termsField.handleChange((current) =>
                              (current ?? []).map((item, itemIndex) => ({
                                ...item,
                                isCurrent: itemIndex === index ? isCurrent : false,
                              })),
                            );
                          }}
                          className="size-4 rounded border-input accent-primary"
                        />
                        Current
                      </label>
                      <button
                        type="button"
                        disabled={(termsField.state.value ?? []).length === 1}
                        onClick={() => termsField.removeValue(index)}
                        aria-label={`Remove term ${index + 1}`}
                        className="flex size-9 items-center justify-center self-end rounded-lg text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe selector={(state) => [state.submissionAttempts, state.values] as const}>
            {([attempts, values]) => {
              const result = createAcademicYearSchema.safeParse(values);
              if (!attempts || result.success) return null;
              return (
                <div ref={validationSummary} tabIndex={-1} role="alert"
                  className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="font-semibold">Could not save the academic calendar. Correct the following:</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {result.error.issues.map((issue, index) => {
                      const termIndex = issue.path[0] === "terms" && typeof issue.path[1] === "number" ? issue.path[1] : undefined;
                      const field = String(issue.path.at(-1) ?? "");
                      const label = field === "startDate" ? "start date" : field === "endDate" ? "end date" : field === "name" ? "name" : "terms";
                      const target = termIndex === undefined ? field : `term-${termIndex}-${field === "startDate" ? "start" : field === "endDate" ? "end" : "name"}`;
                      return <li key={index}>
                        <button type="button" className="text-left underline underline-offset-2"
                          onClick={() => document.getElementById(target)?.focus()}>
                          {termIndex === undefined ? `Academic year ${label}` : `Term ${termIndex + 1} ${label}`}: {issue.message}
                        </button>
                      </li>;
                    })}
                  </ul>
                </div>
              );
            }}
          </form.Subscribe>

          {mutation.error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <CircleAlert className="size-4 shrink-0" />
              Could not save the academic calendar: {mutation.error.message}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-xs font-medium text-success">
              <Check className="size-4" />
              Academic year and terms saved. The setup checklist has been updated.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 className="size-3.5" />
              Each academic year can contain up to three terms.
            </p>
            <FormSubmitButton isSubmitting={mutation.isPending}>
              <Check className="size-4" />
              Save academic calendar
            </FormSubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {years.map((year) => (
          <AcademicYearCard key={year.id} year={year} />
        ))}
      </section>
      {years.some(year => year.terms.length > 0) && <AcademicCalendarPolicyWorkspace years={years} />}
      {!years.length && (
        <p className="rounded-xl border border-dashed border-input bg-card p-5 text-center text-xs text-muted-foreground">
          No academic calendars have been configured for this school.
        </p>
      )}
    </div>
  );
}
