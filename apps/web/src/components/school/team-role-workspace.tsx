import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Crown, LoaderCircle, Lock, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ROLES, updateSchoolMemberRolesSchema, type Role } from "@schoolhub/shared";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { schoolRoleLabel, useSchoolRole } from "@/components/school/school-role-switcher";
import { useSession } from "@/lib/auth-client";
import { useCanExportTables } from "@/lib/table-export-policy";
import { apiFetch } from "@/lib/api";

interface SchoolMember {
  userId: string;
  name: string;
  email: string;
  primaryRole: Role;
  roles: Role[];
}

/** Mirrors the API: only the owner may grant or remove these. */
const OWNER_ONLY: readonly Role[] = ["admin", "headmistress"];

const ROLE_HELP: Record<Role, string> = {
  owner: "Owns the school workspace.",
  admin: "Manages school settings, classes, people and roles.",
  headmistress: "Same management access as an administrator.",
  teacher: "Teacher portal, classes, assessments and attendance.",
  accountant: "Fees, payments, expenses and payroll.",
  staff: "General records, attendance and inventory.",
  student: "Student portal and timetable.",
  guardian: "Parent / guardian portal.",
};

const assignable = ROLES.filter((role) => role !== "owner");
const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200";

export function TeamRoleWorkspace() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { primaryRole: actorRole } = useSchoolRole();
  const canExport = useCanExportTables();
  const [editing, setEditing] = useState<SchoolMember | null>(null);
  const [filter, setFilter] = useState<Role | "all">("all");
  const [notice, setNotice] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["school", "members"],
    queryFn: () => apiFetch<SchoolMember[]>("/schools/members"),
    retry: false,
  });

  const rows = useMemo(
    () => (members.data ?? []).filter((member) => filter === "all" || member.roles.includes(filter)),
    [members.data, filter],
  );
  const counts = useMemo(() => {
    const result = new Map<Role, number>();
    for (const member of members.data ?? []) for (const role of member.roles) result.set(role, (result.get(role) ?? 0) + 1);
    return result;
  }, [members.data]);

  if (members.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
        <LoaderCircle className="size-4 animate-spin" />
        Loading school accounts…
      </div>
    );
  }
  if (members.error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        School accounts could not be loaded: {members.error.message}
      </div>
    );
  }

  const columns: DataTableColumn<SchoolMember>[] = [
    {
      id: "person",
      header: "Person",
      value: (member) => `${member.name} (${member.email})`,
      cell: (member) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {member.name}
            {member.userId === session?.user?.id && (
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">You</span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
      ),
    },
    {
      id: "primary",
      header: "Primary role",
      value: (member) => schoolRoleLabel(member.primaryRole),
      cell: (member) => (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
          {member.primaryRole === "owner" && <Crown className="size-3" />}
          {schoolRoleLabel(member.primaryRole)}
        </span>
      ),
    },
    {
      id: "extra",
      header: "Additional roles",
      value: (member) =>
        member.roles
          .filter((role) => role !== member.primaryRole)
          .map(schoolRoleLabel)
          .join(", "),
      cell: (member) => {
        const extra = member.roles.filter((role) => role !== member.primaryRole);
        return extra.length ? (
          <div className="flex flex-wrap gap-1.5">
            {extra.map((role) => (
              <span key={role} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                {schoolRoleLabel(role)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (member) => (
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setEditing(member);
          }}
          aria-label={`Manage roles for ${member.name}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
        >
          <UserRoundCog className="size-3.5" /> Manage roles
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-sky-50/60 p-5 shadow-sm sm:p-6 dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Team roles</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              One account can hold several roles in this school, for example a teacher who is also an accountant. Each person keeps their primary role and can switch between the roles you give them. Only the school owner can grant or remove administrator and headmistress access.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          Show
          <select className={inputClass} value={filter} onChange={(event) => setFilter(event.target.value as Role | "all")}>
            <option value="all">Everyone ({members.data?.length ?? 0})</option>
            {ROLES.filter((role) => counts.has(role)).map((role) => (
              <option key={role} value={role}>
                {schoolRoleLabel(role)} ({counts.get(role)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(member) => member.userId}
        exportTitle="Team roles"
        canExport={canExport}
        searchPlaceholder="Search name or email…"
        emptyTitle={filter === "all" ? "No school accounts yet" : "No one has this role"}
        emptyDescription={
          filter === "all"
            ? "Accounts appear here once people are given a login."
            : "Choose another role to see who holds it."
        }
      />

      {editing && (
        <RoleDialog
          key={editing.userId}
          member={editing}
          actorIsOwner={actorRole === "owner"}
          onClose={() => setEditing(null)}
          onSaved={async (updated) => {
            setEditing(null);
            setNotice(`Roles updated for ${updated.name}.`);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["school", "members"] }),
              queryClient.invalidateQueries({ queryKey: ["schools", "roles"] }),
            ]);
          }}
        />
      )}
    </div>
  );
}

function RoleDialog({
  member,
  actorIsOwner,
  onClose,
  onSaved,
}: {
  member: SchoolMember;
  actorIsOwner: boolean;
  onClose: () => void;
  onSaved: (updated: SchoolMember) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Role[]>(member.roles);
  const [problem, setProblem] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once: focus the first option, close on Escape, and hand focus back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("input:not(:disabled)")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const save = useMutation({
    mutationFn: (roles: Role[]) =>
      apiFetch<SchoolMember>(`/schools/members/${member.userId}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ roles }),
      }),
    onSuccess: onSaved,
  });

  const changed =
    selected.length !== member.roles.length || selected.some((role) => !member.roles.includes(role));

  function toggle(role: Role, checked: boolean) {
    setProblem(null);
    setSelected((current) => (checked ? [...new Set([...current, role])] : current.filter((item) => item !== role)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateSchoolMemberRolesSchema.safeParse({ roles: selected });
    if (!parsed.success) return setProblem("Choose at least one role.");
    setProblem(null);
    save.mutate(parsed.data.roles);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !save.isPending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6 dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="role-dialog-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Roles for {member.name}
            </h2>
            <p className="truncate text-xs text-slate-500">{member.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Assigned roles</legend>
            {member.primaryRole === "owner" && (
              <RoleOption role="owner" checked disabled note="Primary role, cannot be removed." />
            )}
            {assignable.map((role) => {
              const isPrimary = role === member.primaryRole;
              const ownerOnly = OWNER_ONLY.includes(role) && !actorIsOwner;
              const note = isPrimary
                ? "Primary role, cannot be removed."
                : ownerOnly
                  ? "Only the school owner can change this."
                  : ROLE_HELP[role];
              return (
                <RoleOption
                  key={role}
                  role={role}
                  checked={selected.includes(role)}
                  disabled={isPrimary || ownerOnly || save.isPending}
                  locked={isPrimary || ownerOnly}
                  note={note}
                  onChange={(checked) => toggle(role, checked)}
                />
              );
            })}
          </fieldset>

          {(problem || save.error) && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {problem ?? `Roles could not be saved: ${save.error?.message}`}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!changed || save.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Save roles
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleOption({
  role,
  checked,
  disabled,
  locked,
  note,
  onChange,
}: {
  role: Role;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  note: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
        checked
          ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-400/30 dark:bg-indigo-400/10"
          : "border-slate-100 dark:border-white/10"
      } ${disabled ? "opacity-80" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
          {schoolRoleLabel(role)}
          {locked && <Lock className="size-3 text-slate-400" aria-hidden="true" />}
        </span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{note}</span>
      </span>
    </label>
  );
}
