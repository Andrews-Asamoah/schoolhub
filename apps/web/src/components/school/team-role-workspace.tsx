import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CircleAlert, LoaderCircle, Save, UsersRound } from "lucide-react";
import {
  ROLES,
  updateSchoolMemberRolesSchema,
  type Role,
} from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";

interface SchoolMember {
  userId: string;
  name: string;
  email: string;
  primaryRole: Role;
  roles: Role[];
}

const displayRole = (role: Role) =>
  role === "guardian"
    ? "Parent / guardian"
    : role === "headmistress"
      ? "Headmistress"
      : role.charAt(0).toUpperCase() + role.slice(1);

export function TeamRoleWorkspace() {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ["school", "members"],
    queryFn: () => apiFetch<SchoolMember[]>("/schools/members"),
    retry: false,
  });
  const updateRoles = useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: Role[] }) =>
      apiFetch<SchoolMember>(`/schools/members/${userId}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ roles }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school", "members"] }),
        queryClient.invalidateQueries({ queryKey: ["schools", "roles"] }),
      ]);
    },
  });

  if (members.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-sky-50/60 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <UsersRound className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">Team roles</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              One account can have more than one role in this school. Select the roles a person may switch between. School memberships cannot be shared across schools; use separate sign-in credentials for each school.
            </p>
          </div>
        </div>
      </div>

      {updateRoles.error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="size-4 shrink-0" />
          Role assignments could not be saved: {updateRoles.error.message}
        </p>
      )}

      {(members.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No school accounts are available yet.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {members.data?.map((member) => (
            <MemberRoleForm
              key={member.userId}
              member={member}
              isSaving={updateRoles.isPending}
              onSave={(roles) =>
                updateRoles.mutateAsync({ userId: member.userId, roles })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRoleForm({
  member,
  isSaving,
  onSave,
}: {
  member: SchoolMember;
  isSaving: boolean;
  onSave: (roles: Role[]) => Promise<unknown>;
}) {
  const form = useForm({
    defaultValues: { roles: member.roles },
    validators: { onSubmit: updateSchoolMemberRolesSchema },
    onSubmit: async ({ value }) => onSave(value.roles),
  });
  useEffect(() => {
    form.reset({ roles: member.roles });
  }, [form, member.roles]);
  const roleOptions = ROLES.filter(
    (role) => role !== "owner",
  );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch(() => undefined);
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
          <p className="truncate text-xs text-slate-500">{member.email}</p>
        </div>
        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
          Primary: {displayRole(member.primaryRole)}
        </span>
      </div>

      <form.Field name="roles" mode="array">
        {(field) => (
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Assigned roles for {member.name}</legend>
            {roleOptions.map((role) => {
              const checked = field.state.value.includes(role);
              const locked = role === member.primaryRole;
              return (
                <label
                  key={role}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked || isSaving}
                    onChange={(event) =>
                      field.handleChange((current) =>
                        event.target.checked
                          ? [...current, role]
                          : current.filter((assigned) => assigned !== role),
                      )
                    }
                    className="size-4 rounded border-slate-300 accent-indigo-600"
                  />
                  {displayRole(role)}
                </label>
              );
            })}
            {member.primaryRole === "owner" && (
              <label className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                <input type="checkbox" checked disabled className="size-4 rounded border-slate-300 accent-indigo-600" />
                School owner
              </label>
            )}
          </fieldset>
        )}
      </form.Field>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving || !form.state.isDirty}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save roles
        </button>
      </div>
    </form>
  );
}
