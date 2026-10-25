import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Pencil, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CreateTermInput, UpdateAcademicYearInput, UpdateTermInput } from "@schoolhub/shared";
import { FormField, FormInput } from "@/components/forms/form-controls";
import { apiFetch } from "@/lib/api";

export interface YearTerm {
  id: string;
  name: string;
  termNumber: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface YearRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: YearTerm[];
}

const day = (value: string) => value.slice(0, 10);
const show = (value: string) => new Date(value).toLocaleDateString();

const smallButton =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground/80 transition hover:bg-muted/50 disabled:opacity-50";
const primaryButton =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";

/** One academic year with inline editing of the year, its terms, and adding terms later. */
export function AcademicYearCard({ year }: { year: YearRecord }) {
  const queryClient = useQueryClient();
  const [editingYear, setEditingYear] = useState(false);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [addingTerm, setAddingTerm] = useState(false);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["schools", "academic-years"] }),
      queryClient.invalidateQueries({ queryKey: ["school", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["academics"] }),
    ]);
  };

  const saveYear = useMutation({
    mutationFn: (input: UpdateAcademicYearInput) =>
      apiFetch(`/schools/academic-years/${year.id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setEditingYear(false);
      await refresh();
    },
  });
  const saveTerm = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTermInput }) =>
      apiFetch(`/schools/terms/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setEditingTermId(null);
      await refresh();
    },
  });
  const addTerm = useMutation({
    mutationFn: (input: CreateTermInput) =>
      apiFetch(`/schools/academic-years/${year.id}/terms`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setAddingTerm(false);
      await refresh();
    },
  });

  const usedNumbers = new Set(year.terms.map((term) => term.termNumber));
  const nextTermNumber = [1, 2, 3].find((number) => !usedNumbers.has(number));
  const error = saveYear.error ?? saveTerm.error ?? addTerm.error;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {editingYear ? (
        <YearForm
          initial={{ name: year.name, startDate: day(year.startDate), endDate: day(year.endDate) }}
          isCurrent={year.isCurrent}
          pending={saveYear.isPending}
          onCancel={() => setEditingYear(false)}
          onSave={(values) => saveYear.mutate(values)}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">{year.name}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {show(year.startDate)} – {show(year.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {year.isCurrent ? (
              <span className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                Current
              </span>
            ) : (
              <button
                type="button"
                className={smallButton}
                disabled={saveYear.isPending || year.terms.length === 0}
                title={year.terms.length === 0 ? "Add a term first" : undefined}
                onClick={() => saveYear.mutate({ isCurrent: true })}
              >
                Make current
              </button>
            )}
            <button type="button" className={smallButton} onClick={() => setEditingYear(true)} aria-label={`Edit ${year.name}`}>
              <Pencil className="size-3" /> Edit
            </button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {year.terms.map((term) =>
          editingTermId === term.id ? (
            <li key={term.id}>
              <TermForm
                initial={{ name: term.name, startDate: day(term.startDate), endDate: day(term.endDate) }}
                canBeCurrent={year.isCurrent}
                isCurrent={term.isCurrent}
                pending={saveTerm.isPending}
                onCancel={() => setEditingTermId(null)}
                onSave={(values) => saveTerm.mutate({ id: term.id, input: values })}
              />
            </li>
          ) : (
            <li
              key={term.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px]"
            >
              <span>
                <span className="font-semibold text-foreground">
                  {term.name}
                  {term.isCurrent ? " · Current" : ""}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {show(term.startDate)} – {show(term.endDate)}
                </span>
              </span>
              <span className="flex gap-1.5">
                {year.isCurrent && !term.isCurrent && (
                  <button
                    type="button"
                    className={smallButton}
                    disabled={saveTerm.isPending}
                    onClick={() => saveTerm.mutate({ id: term.id, input: { isCurrent: true } })}
                  >
                    Make current
                  </button>
                )}
                <button type="button" className={smallButton} onClick={() => setEditingTermId(term.id)} aria-label={`Edit ${term.name}`}>
                  <Pencil className="size-3" /> Edit
                </button>
              </span>
            </li>
          ),
        )}
        {year.terms.length === 0 && (
          <li className="text-[11px] text-warning">No terms added yet</li>
        )}
      </ul>

      {addingTerm && nextTermNumber ? (
        <div className="mt-3">
          <TermForm
            initial={{ name: `Term ${nextTermNumber}`, startDate: "", endDate: "" }}
            canBeCurrent={year.isCurrent}
            isCurrent={false}
            pending={addTerm.isPending}
            submitLabel={`Add term ${nextTermNumber}`}
            onCancel={() => setAddingTerm(false)}
            onSave={(values) =>
              addTerm.mutate({
                name: values.name ?? `Term ${nextTermNumber}`,
                termNumber: nextTermNumber,
                startDate: values.startDate ?? "",
                endDate: values.endDate ?? "",
                isCurrent: values.isCurrent ?? false,
              })
            }
          />
        </div>
      ) : (
        <button
          type="button"
          className={`${smallButton} mt-3`}
          disabled={!nextTermNumber}
          title={!nextTermNumber ? "An academic year can have at most three terms" : undefined}
          onClick={() => {
            addTerm.reset();
            setAddingTerm(true);
          }}
        >
          <Plus className="size-3" /> Add term
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error.message}
        </p>
      )}
    </article>
  );
}

function YearForm({
  initial,
  isCurrent,
  pending,
  onSave,
  onCancel,
}: {
  initial: { name: string; startDate: string; endDate: string };
  isCurrent: boolean;
  pending: boolean;
  onSave: (values: UpdateAcademicYearInput) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [current, setCurrent] = useState(isCurrent);
  const [problem, setProblem] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.name.trim()) return setProblem("Enter a name for the academic year.");
    if (values.endDate <= values.startDate) return setProblem("The academic year must end after it starts.");
    setProblem(null);
    onSave({ ...values, ...(current !== isCurrent ? { isCurrent: current } : {}) });
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Year name" htmlFor="year-name">
          <FormInput id="year-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </FormField>
        <FormField label="Starts" htmlFor="year-start">
          <FormInput id="year-start" type="date" value={values.startDate} onChange={(e) => setValues({ ...values, startDate: e.target.value })} />
        </FormField>
        <FormField label="Ends" htmlFor="year-end">
          <FormInput id="year-end" type="date" value={values.endDate} onChange={(e) => setValues({ ...values, endDate: e.target.value })} />
        </FormField>
      </div>
      {!isCurrent && (
        <label className="flex items-center gap-2 text-[11px] font-medium text-foreground/80">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-primary" />
          Set as current year
        </label>
      )}
      {problem && <p role="alert" className="text-[11px] text-destructive">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={pending}>Save year</button>
        <button type="button" className={smallButton} onClick={onCancel}><X className="size-3" /> Cancel</button>
      </div>
    </form>
  );
}

interface TermFormValues {
  name?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

function TermForm({
  initial,
  isCurrent,
  canBeCurrent,
  pending,
  submitLabel = "Save term",
  onSave,
  onCancel,
}: {
  initial: { name: string; startDate: string; endDate: string };
  isCurrent: boolean;
  canBeCurrent: boolean;
  pending: boolean;
  submitLabel?: string;
  onSave: (values: TermFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [current, setCurrent] = useState(isCurrent);
  const [problem, setProblem] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (values.name.trim().length < 2) return setProblem("Enter a term name.");
    if (!values.startDate || !values.endDate) return setProblem("Choose start and end dates.");
    if (values.endDate <= values.startDate) return setProblem("A term must end after it starts.");
    setProblem(null);
    onSave({ ...values, ...(current !== isCurrent ? { isCurrent: current } : {}) });
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-primary/20 bg-primary/10 p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Term name" htmlFor="term-name">
          <FormInput id="term-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </FormField>
        <FormField label="Starts" htmlFor="term-start">
          <FormInput id="term-start" type="date" value={values.startDate} onChange={(e) => setValues({ ...values, startDate: e.target.value })} />
        </FormField>
        <FormField label="Ends" htmlFor="term-end">
          <FormInput id="term-end" type="date" value={values.endDate} onChange={(e) => setValues({ ...values, endDate: e.target.value })} />
        </FormField>
      </div>
      {canBeCurrent && !isCurrent && (
        <label className="flex items-center gap-2 text-[11px] font-medium text-foreground/80">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-primary" />
          Make this the current term
        </label>
      )}
      {problem && <p role="alert" className="text-[11px] text-destructive">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={pending}>{submitLabel}</button>
        <button type="button" className={smallButton} onClick={onCancel}><X className="size-3" /> Cancel</button>
      </div>
    </form>
  );
}
