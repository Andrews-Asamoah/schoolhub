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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-5 py-5 sm:px-6 dark:border-white/10 dark:from-indigo-400/[0.08] dark:via-slate-900 dark:to-sky-400/[0.05]">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
                School setup · Step 1
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Set up the academic calendar
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">
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
                  <FormInput
                    id={field.name}
                    type="date"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="endDate">
              {(field) => (
                <FormField label="Year ends" htmlFor={field.name} error={field.state.meta.errors}>
                  <FormInput
                    id={field.name}
                    type="date"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="isCurrent">
              {(field) => (
                <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-white/10 dark:text-slate-300">
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
                    className="size-4 rounded border-slate-300 accent-indigo-600"
                  />
                  Set as current year
                </label>
              )}
            </form.Field>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Terms</h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-300/20 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-indigo-400/10"
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
                      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_0.65fr_0.65fr_auto_auto]"
                    >
                      <FormField label={`Term ${index + 1} name`} htmlFor={`term-${index}-name`}>
                        <FormInput
                          id={`term-${index}-name`}
                          value={term.name}
                          onBlur={termsField.handleBlur}
                          onChange={(event) => {
                            const name = event.target.value;
                            termsField.handleChange((current) =>
                              (current ?? []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name } : item,
                              ),
                            );
                          }}
                          placeholder={`Term ${index + 1}`}
                        />
                      </FormField>
                      <FormField label="Starts" htmlFor={`term-${index}-start`}>
                        <FormInput
                          id={`term-${index}-start`}
                          type="date"
                          value={term.startDate}
                          onBlur={termsField.handleBlur}
                          onChange={(event) => {
                            const startDate = event.target.value;
                            termsField.handleChange((current) =>
                              (current ?? []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, startDate } : item,
                              ),
                            );
                          }}
                        />
                      </FormField>
                      <FormField label="Ends" htmlFor={`term-${index}-end`}>
                        <FormInput
                          id={`term-${index}-end`}
                          type="date"
                          value={term.endDate}
                          onBlur={termsField.handleBlur}
                          onChange={(event) => {
                            const endDate = event.target.value;
                            termsField.handleChange((current) =>
                              (current ?? []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, endDate } : item,
                              ),
                            );
                          }}
                        />
                      </FormField>
                      <label className="flex items-center gap-2 self-end rounded-lg px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-300">
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
                          className="size-4 rounded border-slate-300 accent-indigo-600"
                        />
                        Current
                      </label>
                      <button
                        type="button"
                        disabled={(termsField.state.value ?? []).length === 1}
                        onClick={() => termsField.removeValue(index)}
                        aria-label={`Remove term ${index + 1}`}
                        className="flex size-9 items-center justify-center self-end rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-400/10 dark:hover:text-rose-200"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  {termsField.state.meta.errors.length > 0 && (
                    <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300">
                      <CircleAlert className="size-3.5" />
                      {String(termsField.state.meta.errors[0])}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
          </div>

          {mutation.error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
              <CircleAlert className="size-4 shrink-0" />
              Could not save the academic calendar: {mutation.error.message}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Check className="size-4" />
              Academic year and terms saved. The setup checklist has been updated.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
      {!years.length && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-400">
          No academic calendars have been configured for this school.
        </p>
      )}
    </div>
  );
}
