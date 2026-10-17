import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  House,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  createHouseSchema,
  updateHouseSchema,
} from "@schoolhub/shared";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface HouseRecord {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string | null;
  motto: string | null;
  houseTeacherId: string | null;
  isActive: boolean;
  houseTeacher: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profile: { firstName: string; lastName: string } | null;
  } | null;
  _count: { students: number };
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

interface HouseFormValues {
  name: string;
  code: string;
  description: string;
  color: string;
  motto: string;
  houseTeacherId: string;
  isActive: boolean;
}

const emptyForm: HouseFormValues = {
  name: "",
  code: "",
  description: "",
  color: "#2563EB",
  motto: "",
  houseTeacherId: "",
  isActive: true,
};

const inputClasses =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

export function HousesWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = activeRole === "owner" || activeRole === "admin";
  const [editing, setEditing] = useState<HouseRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [values, setValues] = useState<HouseFormValues>(emptyForm);

  const housesQuery = useQuery({
    queryKey: ["academics", "houses"],
    queryFn: () => apiFetch<HouseRecord[]>("/academics/houses"),
    retry: false,
  });
  const teachersQuery = useQuery({
    queryKey: ["academics", "class-teachers"],
    queryFn: () => apiFetch<TeacherOption[]>("/academics/teachers"),
    enabled: canManage,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: HouseFormValues;
    }) => {
      if (id) {
        const payload = updateHouseSchema.parse(input);
        return apiFetch<HouseRecord>(`/academics/houses/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      const payload = createHouseSchema.parse(input);
      return apiFetch<HouseRecord>("/academics/houses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["academics", "houses"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);
      closeForm();
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setValues(emptyForm);
    saveMutation.reset();
  }

  function openCreate() {
    setEditing(null);
    setValues(emptyForm);
    saveMutation.reset();
    setShowForm(true);
  }

  function openEdit(house: HouseRecord) {
    setEditing(house);
    setValues({
      name: house.name,
      code: house.code,
      description: house.description ?? "",
      color: house.color ?? "#2563EB",
      motto: house.motto ?? "",
      houseTeacherId: house.houseTeacherId ?? "",
      isActive: house.isActive,
    });
    saveMutation.reset();
    setShowForm(true);
  }

  if (!canManage) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Only school owners and administrators can manage houses.
        </p>
      </section>
    );
  }

  if (housesQuery.isPending || teachersQuery.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading school houses…
      </div>
    );
  }

  if (housesQuery.error || teachersQuery.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          {housesQuery.error
            ? `Houses could not be loaded: ${housesQuery.error.message}`
            : `Teachers could not be loaded: ${teachersQuery.error?.message}`}
        </span>
      </div>
    );
  }

  const houses = housesQuery.data ?? [];
  const teachers = teachersQuery.data ?? [];
  const activeCount = houses.filter((house) => house.isActive).length;
  const assignedStudents = houses.reduce(
    (total, house) => total + house._count.students,
    0,
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-amber-500/5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <House className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                School houses
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Set up permanent houses for your school. Houses stay in place
                across academic years; students can be assigned to an active
                house when their profile is created or edited.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="size-4" />
            Add house
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <HouseMetric label="Total houses" value={houses.length} />
        <HouseMetric label="Active houses" value={activeCount} />
        <HouseMetric label="Students assigned" value={assignedStudents} />
      </div>

      {showForm && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {editing ? `Edit ${editing.name}` : "Create a house"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                House details and assignments are school-wide, not tied to a
                particular academic year.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close house form"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.reset();
              saveMutation.mutate({ id: editing?.id, input: values });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-foreground">
                House name
                <input
                  required
                  maxLength={100}
                  className={inputClasses}
                  value={values.name}
                  onChange={(event) =>
                    setValues({ ...values, name: event.target.value })
                  }
                  placeholder="e.g. Golden Eagles"
                />
              </label>
              <label className="text-xs font-semibold text-foreground">
                House code
                <input
                  required
                  maxLength={20}
                  pattern="[A-Za-z0-9-]+"
                  className={inputClasses}
                  value={values.code}
                  onChange={(event) =>
                    setValues({ ...values, code: event.target.value })
                  }
                  placeholder="e.g. EAGLES"
                />
              </label>
              <label className="text-xs font-semibold text-foreground">
                House color
                <span className="mt-1.5 flex h-10 items-center gap-3 rounded-lg border border-border bg-background px-3">
                  <input
                    type="color"
                    aria-label="Choose house color"
                    value={values.color}
                    onChange={(event) =>
                      setValues({ ...values, color: event.target.value })
                    }
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-xs font-medium uppercase text-muted-foreground">
                    {values.color}
                  </span>
                </span>
              </label>
              <label className="text-xs font-semibold text-foreground">
                Lead teacher
                <select
                  className={inputClasses}
                  value={values.houseTeacherId}
                  onChange={(event) =>
                    setValues({ ...values, houseTeacherId: event.target.value })
                  }
                >
                  <option value="">No lead teacher assigned</option>
                  {teachers
                    .filter(
                      (teacher) =>
                        teacher.isActive ||
                        teacher.id === values.houseTeacherId,
                    )
                    .map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.firstName} {teacher.lastName}
                        {!teacher.isActive ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-foreground sm:col-span-2">
                Motto
                <input
                  maxLength={200}
                  className={inputClasses}
                  value={values.motto}
                  onChange={(event) =>
                    setValues({ ...values, motto: event.target.value })
                  }
                  placeholder="A short phrase that represents the house"
                />
              </label>
              <label className="text-xs font-semibold text-foreground sm:col-span-2">
                Description
                <textarea
                  maxLength={500}
                  rows={3}
                  className={`${inputClasses} h-auto min-h-20 py-2.5`}
                  value={values.description}
                  onChange={(event) =>
                    setValues({ ...values, description: event.target.value })
                  }
                  placeholder="Optional background or information about this house"
                />
              </label>
            </div>

            {editing && (
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  onChange={(event) =>
                    setValues({ ...values, isActive: event.target.checked })
                  }
                  className="size-4 rounded border-border accent-primary"
                />
                Active and available for new student assignments
              </label>
            )}

            {saveMutation.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{saveMutation.error.message}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={closeForm}
                className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saveMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {editing ? "Save changes" : "Create house"}
              </button>
            </div>
          </form>
        </section>
      )}

      {houses.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {houses.map((house) => {
            const leadName = house.houseTeacher
              ? `${house.houseTeacher.profile?.firstName ?? house.houseTeacher.firstName ?? ""} ${house.houseTeacher.profile?.lastName ?? house.houseTeacher.lastName ?? ""}`.trim()
              : null;
            return (
              <article
                key={house.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div
                  className="h-1.5"
                  style={{ backgroundColor: house.color ?? "#64748B" }}
                />
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                        style={{ backgroundColor: house.color ?? "#64748B" }}
                      >
                        {house.code.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-foreground">
                          {house.name}
                        </h3>
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                          {house.code}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        house.isActive
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {house.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {(house.motto || house.description) && (
                    <p className="line-clamp-2 min-h-9 text-xs leading-5 text-muted-foreground">
                      {house.motto ? `“${house.motto}”` : house.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="min-w-0 space-y-1.5 text-xs">
                      <p className="truncate text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          Lead:
                        </span>{" "}
                        {leadName || "Not assigned"}
                      </p>
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <UsersRound className="size-3.5" />
                        {house._count.students}{" "}
                        {house._count.students === 1 ? "student" : "students"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(house)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <House className="size-5" />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            Create your first house
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            Add each permanent school house with its color, motto, and lead
            teacher. You can assign students to houses from their profiles.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Add first house
          </button>
        </section>
      )}
    </div>
  );
}

function HouseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
