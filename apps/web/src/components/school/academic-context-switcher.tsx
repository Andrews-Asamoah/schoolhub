import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const canManageSchoolContext = ["owner", "admin", "headteacher"].includes(
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
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
      >
        <CircleAlert className="size-3.5 shrink-0" />
        Academic period unavailable
      </span>
    );
  }

  if (yearsQuery.isPending || contextQuery.isPending) return null;

  if (!current) {
    return (
      <span className="hidden items-center gap-1.5 rounded-xl border border-border/80 bg-card/90 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
        <CalendarRange className="size-3.5 text-muted-foreground/70" />
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
        className="hidden items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3.5 py-1.5 text-xs font-semibold text-foreground/80 shadow-xs sm:inline-flex"
      >
        <CalendarRange className="size-4 shrink-0 text-primary" />
        <span>
          {current.academicYear.name} · {current.term.name}
        </span>
      </span>
    );
  }

  const isCurrentSelection =
    academicYearId === current.academicYear.id && termId === current.term.id;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/90 p-1 shadow-xs">
        <CalendarRange className="size-4 shrink-0 text-primary ml-2" />

        {/* Academic Year Select */}
        <Select
          value={academicYearId}
          onValueChange={(yearId) => {
            const year = yearsQuery.data?.find((item) => item.id === yearId);
            setAcademicYearId(yearId);
            setTermId(
              year?.terms.find((term) => term.isCurrent)?.id ??
                year?.terms[0]?.id ??
                "",
            );
            mutation.reset();
          }}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="h-7 border-none bg-transparent px-1.5 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {(yearsQuery.data ?? []).map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground/50 font-bold">·</span>

        {/* Term Select */}
        <Select
          value={termId}
          onValueChange={(val) => {
            setTermId(val);
            mutation.reset();
          }}
          disabled={!selectedYear?.terms.length || mutation.isPending}
        >
          <SelectTrigger className="h-7 border-none bg-transparent px-1.5 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {(selectedYear?.terms ?? []).map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action Button */}
        {isAccountant ? (
          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              disabled={!selectedTerm}
              onClick={() => {
                if (!selectedYear || !selectedTerm) return;
                const isSchoolCurrent =
                  selectedYear.id === current.academicYear.id &&
                  selectedTerm.id === current.term.id;
                if (isSchoolCurrent) {
                  window.sessionStorage.removeItem(ACCOUNTANT_VIEW_STORAGE_KEY);
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
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              View
            </button>
            {hasPersonalOverride && (
              <button
                type="button"
                title="Return to current school period"
                onClick={() => {
                  window.sessionStorage.removeItem(ACCOUNTANT_VIEW_STORAGE_KEY);
                  setHasPersonalOverride(false);
                  setAcademicYearId(current.academicYear.id);
                  setTermId(current.term.id);
                  void queryClient.invalidateQueries();
                }}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                Current
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={mutation.isPending || !academicYearId || !termId || isCurrentSelection}
            onClick={() => mutation.mutate()}
            className="ml-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Switching…" : "Apply"}
          </button>
        )}
      </div>

      {mutation.error && (
        <span
          role="alert"
          className="text-right text-[10px] text-destructive"
        >
          Could not switch academic period: {mutation.error.message}
        </span>
      )}
    </div>
  );
}