import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface AcademicTerm {
  id: string;
  name: string;
  termNumber: number;
  isCurrent: boolean;
}

interface AcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: AcademicTerm[];
}

interface AcademicContext {
  academicYear: AcademicYear;
  term: AcademicTerm;
}

const ACCOUNTANT_VIEW_STORAGE_KEY = "schoolhub-accountant-academic-view";

export function AcademicContextSwitcher() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const isAccountant = activeRole === "accountant";
  const canManageSchoolContext = ["owner", "admin", "headmistress"].includes(
    activeRole ?? "",
  );
  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => apiFetch<AcademicYear[]>("/schools/academic-years"),
    retry: false,
  });
  const contextQuery = useQuery({
    queryKey: ["schools", "academic-context"],
    queryFn: () => apiFetch<AcademicContext | null>("/schools/academic-context"),
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [hasPersonalOverride, setHasPersonalOverride] = useState(false);
  const lastObservedContext = useRef<string | null>(null);
  const current = contextQuery.data;

  useEffect(() => {
    if (!isAccountant || !yearsQuery.data) return;
    const stored = window.sessionStorage.getItem(ACCOUNTANT_VIEW_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          academicYearId?: unknown;
          termId?: unknown;
        };
        const storedYear = yearsQuery.data.find(
          (year) => year.id === parsed.academicYearId,
        );
        const storedTerm = storedYear?.terms.find(
          (term) => term.id === parsed.termId,
        );
        if (storedYear && storedTerm) {
          setAcademicYearId(storedYear.id);
          setTermId(storedTerm.id);
          setHasPersonalOverride(
            storedYear.id !== current?.academicYear.id ||
              storedTerm.id !== current?.term.id,
          );
          return;
        }
        window.sessionStorage.removeItem(ACCOUNTANT_VIEW_STORAGE_KEY);
      } catch {
        window.sessionStorage.removeItem(ACCOUNTANT_VIEW_STORAGE_KEY);
      }
    }
    setHasPersonalOverride(false);
    if (current) {
      setAcademicYearId(current.academicYear.id);
      setTermId(current.term.id);
      const contextKey = `${current.academicYear.id}:${current.term.id}`;
      if (
        lastObservedContext.current &&
        lastObservedContext.current !== contextKey
      ) {
        void queryClient.invalidateQueries();
      }
      lastObservedContext.current = contextKey;
    }
  }, [
    current?.academicYear.id,
    current?.term.id,
    isAccountant,
    queryClient,
    yearsQuery.data,
  ]);

  useEffect(() => {
    if (isAccountant) return;
    if (current) {
      setAcademicYearId(current.academicYear.id);
      setTermId(current.term.id);
      const contextKey = `${current.academicYear.id}:${current.term.id}`;
      if (
        lastObservedContext.current &&
        lastObservedContext.current !== contextKey
      ) {
        void queryClient.invalidateQueries();
      }
      lastObservedContext.current = contextKey;
      return;
    }
    if (!academicYearId && yearsQuery.data?.length) {
      const year =
        yearsQuery.data.find((item) => item.isCurrent) ?? yearsQuery.data[0]!;
      setAcademicYearId(year.id);
      setTermId(
        year.terms.find((term) => term.isCurrent)?.id ??
          year.terms[0]?.id ??
          "",
      );
    }
  }, [
    academicYearId,
    current?.academicYear.id,
    current?.term.id,
    isAccountant,
    queryClient,
    yearsQuery.data,
  ]);

  const selectedYear = (yearsQuery.data ?? []).find(
    (year) => year.id === academicYearId,
  );
  const selectedTerm = selectedYear?.terms.find((term) => term.id === termId);
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<AcademicContext>("/schools/academic-context", {
        method: "PATCH",
        body: JSON.stringify({ academicYearId, termId }),
      }),
    onSuccess: async (updatedContext) => {
      queryClient.setQueryData(["schools", "academic-context"], updatedContext);
      await queryClient.invalidateQueries();
    },
  });

  if (yearsQuery.error || contextQuery.error) {
    const error = yearsQuery.error ?? contextQuery.error;
    return (
      <span
        role="alert"
        title={error?.message}
        className="inline-flex items-center gap-1.5 text-xs text-destructive"
      >
        <CircleAlert className="size-3.5 shrink-0" />
        Academic period unavailable
      </span>
    );
  }

  if (yearsQuery.isPending || contextQuery.isPending) return null;

  if (!current) {
    return (
      <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground sm:inline-flex">
        <CalendarRange className="size-3.5" />
        {isAccountant
          ? "Waiting for the school to set a current period"
          : "Set up the current academic period"}
      </span>
    );
  }

  if (!isAccountant && !canManageSchoolContext) {
    return (
      <span
        title="The active academic period is set by a school administrator"
        className="hidden max-w-48 items-center gap-1.5 truncate rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground sm:inline-flex"
      >
        <CalendarRange className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">
          {current.academicYear.name} · {current.term.name}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
        <CalendarRange className="hidden size-4 shrink-0 text-primary sm:block" />
        <label className="sr-only" htmlFor="active-academic-year">
          {isAccountant ? "Academic year to view" : "Active academic year"}
        </label>
        <select
          id="active-academic-year"
          aria-label={isAccountant ? "Academic year to view" : "Active academic year"}
          value={academicYearId}
          disabled={mutation.isPending}
          onChange={(event) => {
            const yearId = event.target.value;
            const year = yearsQuery.data?.find((item) => item.id === yearId);
            setAcademicYearId(yearId);
            setTermId(
              year?.terms.find((term) => term.isCurrent)?.id ??
                year?.terms[0]?.id ??
                "",
            );
            mutation.reset();
          }}
          className="max-w-28 bg-transparent text-xs font-semibold text-foreground outline-none sm:max-w-36"
        >
          {(yearsQuery.data ?? []).map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="active-academic-term">
          {isAccountant ? "Term to view" : "Active term"}
        </label>
        <select
          id="active-academic-term"
          aria-label={isAccountant ? "Term to view" : "Active term"}
          value={termId}
          disabled={!selectedYear?.terms.length || mutation.isPending}
          onChange={(event) => {
            setTermId(event.target.value);
            mutation.reset();
          }}
          className="max-w-24 border-l border-border bg-transparent pl-1.5 text-xs font-semibold text-foreground outline-none sm:max-w-32"
        >
          {(selectedYear?.terms ?? []).map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        {isAccountant ? (
          <>
            <button
              type="button"
              disabled={!selectedTerm}
              onClick={() => {
                if (!selectedYear || !selectedTerm) return;
                const isSchoolCurrent =
                  selectedYear.id === current.academicYear.id &&
                  selectedTerm.id === current.term.id;
                if (isSchoolCurrent) {
                  window.sessionStorage.removeItem(
                    ACCOUNTANT_VIEW_STORAGE_KEY,
                  );
                } else {
                  window.sessionStorage.setItem(
                    ACCOUNTANT_VIEW_STORAGE_KEY,
                    JSON.stringify({
                      academicYearId: selectedYear.id,
                      termId: selectedTerm.id,
                    }),
                  );
                }
                setHasPersonalOverride(!isSchoolCurrent);
                void queryClient.invalidateQueries();
              }}
              className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 sm:text-xs"
            >
              View
            </button>
            {hasPersonalOverride && (
              <button
                type="button"
                title="Return to the school's current academic period"
                onClick={() => {
                  window.sessionStorage.removeItem(
                    ACCOUNTANT_VIEW_STORAGE_KEY,
                  );
                  setHasPersonalOverride(false);
                  setAcademicYearId(current.academicYear.id);
                  setTermId(current.term.id);
                  void queryClient.invalidateQueries();
                }}
                className="border-l border-border pl-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Current
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={
              mutation.isPending ||
              !academicYearId ||
              !termId ||
              (academicYearId === current.academicYear.id &&
                termId === current.term.id)
            }
            onClick={() => mutation.mutate()}
            className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 sm:text-xs"
          >
            {mutation.isPending ? "Switching…" : "Apply"}
          </button>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {isAccountant && hasPersonalOverride
          ? `Personal view: ${selectedYear?.name ?? ""} · ${selectedTerm?.name ?? ""}`
          : isAccountant
            ? `School current: ${current.academicYear.name} · ${current.term.name}`
            : null}
      </span>
      {mutation.error && (
        <span
          role="alert"
          className="max-w-48 text-right text-[10px] text-destructive"
        >
          Could not switch academic period: {mutation.error.message}
        </span>
      )}
    </div>
  );
}
