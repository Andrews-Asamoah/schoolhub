import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  createClubSchema,
  updateClubSchema,
  addClubMemberSchema,
} from "@schoolhub/shared";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface ClubMemberRecord {
  id: string;
  clubId: string;
  studentId: string;
  role: string | null;
  joinedAt: string;
  student: {
    id: string;
    studentId: string;
    admissionNumber: string;
    profile: { firstName: string; lastName: string; gender?: string | null };
    house: { id: string; name: string; color?: string | null } | null;
  };
}

export interface ClubRecord {
  id: string;
  name: string;
  description: string | null;
  teacherInChargeId: string | null;
  isActive: boolean;
  createdAt: string;
  teacherInCharge: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profile: { firstName: string; lastName: string } | null;
  } | null;
  _count: { members: number };
  members?: ClubMemberRecord[];
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

interface StudentOption {
  id: string;
  studentId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  currentClass?: { name: string } | null;
}

interface ClubFormValues {
  name: string;
  description: string;
  teacherInChargeId: string;
  isActive: boolean;
}

const emptyForm: ClubFormValues = {
  name: "",
  description: "",
  teacherInChargeId: "",
  isActive: true,
};

const inputClasses =
  "mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

export function ClubsWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = activeRole === "owner" || activeRole === "admin" || activeRole === "staff";
  
  const [editing, setEditing] = useState<ClubRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [values, setValues] = useState<ClubFormValues>(emptyForm);
  const [selectedClubForMembers, setSelectedClubForMembers] = useState<ClubRecord | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // New Member Modal State
  const [memberStudentId, setMemberStudentId] = useState("");
  const [memberRole, setMemberRole] = useState("Member");
  const [memberSearch, setMemberSearch] = useState("");

  const clubsQuery = useQuery({
    queryKey: ["academics", "clubs"],
    queryFn: () => apiFetch<ClubRecord[]>("/academics/clubs"),
    retry: false,
  });

  const teachersQuery = useQuery({
    queryKey: ["academics", "class-teachers"],
    queryFn: () => apiFetch<TeacherOption[]>("/academics/teachers"),
    enabled: canManage,
    retry: false,
  });

  const studentsQuery = useQuery({
    queryKey: ["students", "roster-all"],
    queryFn: async () => {
      const res = await apiFetch<{ data: StudentOption[] }>("/students?limit=200");
      return res.data;
    },
    enabled: !!selectedClubForMembers && canManage,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: ClubFormValues;
    }) => {
      if (id) {
        const payload = updateClubSchema.parse({
          name: input.name,
          description: input.description || undefined,
          teacherInChargeId: input.teacherInChargeId || null,
          isActive: input.isActive,
        });
        return apiFetch<ClubRecord>(`/academics/clubs/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      const payload = createClubSchema.parse({
        name: input.name,
        description: input.description || undefined,
        teacherInChargeId: input.teacherInChargeId || null,
        isActive: input.isActive,
      });
      return apiFetch<ClubRecord>("/academics/clubs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "clubs"] });
      closeForm();
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({
      clubId,
      studentId,
      role,
    }: {
      clubId: string;
      studentId: string;
      role?: string;
    }) => {
      const payload = addClubMemberSchema.parse({ studentId, role: role || "Member" });
      return apiFetch(`/academics/clubs/${clubId}/members`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "clubs"] });
      setMemberStudentId("");
      setMemberRole("Member");
      // refresh selected club
      if (selectedClubForMembers) {
        const updated = await apiFetch<ClubRecord>(`/academics/clubs/${selectedClubForMembers.id}`);
        setSelectedClubForMembers(updated);
      }
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({
      clubId,
      studentId,
    }: {
      clubId: string;
      studentId: string;
    }) => {
      return apiFetch(`/academics/clubs/${clubId}/members/${studentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "clubs"] });
      if (selectedClubForMembers) {
        const updated = await apiFetch<ClubRecord>(`/academics/clubs/${selectedClubForMembers.id}`);
        setSelectedClubForMembers(updated);
      }
    },
  });

  const deleteClubMutation = useMutation({
    mutationFn: async (clubId: string) => {
      return apiFetch(`/academics/clubs/${clubId}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academics", "clubs"] });
      if (selectedClubForMembers) {
        setSelectedClubForMembers(null);
      }
    },
  });

  function openCreate() {
    setEditing(null);
    setValues(emptyForm);
    setShowForm(true);
  }

  function openEdit(club: ClubRecord) {
    setEditing(club);
    setValues({
      name: club.name,
      description: club.description ?? "",
      teacherInChargeId: club.teacherInChargeId ?? "",
      isActive: club.isActive,
    });
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setValues(emptyForm);
    setShowForm(false);
  }

  const clubs = clubsQuery.data ?? [];
  const totalClubs = clubs.length;
  const activeClubs = clubs.filter((c) => c.isActive).length;
  const totalMembers = clubs.reduce((acc, c) => acc + (c._count?.members || 0), 0);

  const filteredClubs = clubs.filter((c) => {
    if (statusFilter === "ACTIVE" && !c.isActive) return false;
    if (statusFilter === "INACTIVE" && c.isActive) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchDesc = c.description?.toLowerCase().includes(q) ?? false;
      const matchTeacher =
        c.teacherInCharge?.profile
          ? `${c.teacherInCharge.profile.firstName} ${c.teacherInCharge.profile.lastName}`.toLowerCase().includes(q)
          : false;
      return matchName || matchDesc || matchTeacher;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total School Clubs</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">
              <Sparkles className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalClubs}</p>
          <p className="mt-0.5 text-xs text-slate-400">Co-curricular associations</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Clubs</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <UserCheck className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">{activeClubs}</p>
          <p className="mt-0.5 text-xs text-slate-400">Open for student membership</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Student Enrollments</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
              <Users className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalMembers}</p>
          <p className="mt-0.5 text-xs text-slate-400">Members across all clubs</p>
        </div>
      </div>

      {/* Action Header & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search clubs, patrons..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-9 w-60 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === mode
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {mode === "ALL" ? "All Clubs" : mode === "ACTIVE" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </div>

        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="size-4" />
            New Club
          </button>
        )}
      </div>

      {/* Clubs List / Grid */}
      {clubsQuery.isLoading ? (
        <div className="flex items-center justify-center p-12 text-xs text-slate-500">
          <LoaderCircle className="mr-2 size-5 animate-spin text-indigo-600" />
          Loading school clubs…
        </div>
      ) : filteredClubs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Sparkles className="mx-auto size-10 text-indigo-400" />
          <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No clubs found</h3>
          <p className="mt-1 text-xs text-slate-500">
            {searchFilter || statusFilter !== "ALL"
              ? "Try adjusting your search filters."
              : "Get started by adding your school's clubs and societies."}
          </p>
          {canManage && !searchFilter && statusFilter === "ALL" && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="size-4" />
              Create First Club
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClubs.map((club) => {
            const patronName = club.teacherInCharge?.profile
              ? `${club.teacherInCharge.profile.firstName} ${club.teacherInCharge.profile.lastName}`
              : club.teacherInCharge
                ? `${club.teacherInCharge.firstName} ${club.teacherInCharge.lastName}`
                : "No patron assigned";

            return (
              <div
                key={club.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Sparkles className="size-5" />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{club.name}</h4>
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                            club.isActive
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800"
                          }`}
                        >
                          {club.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {club.description || "No description provided for this club."}
                  </p>

                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Teacher Patron:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-44">
                        {patronName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Members Enrolled:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {club._count?.members ?? 0} students
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    onClick={() => setSelectedClubForMembers(club)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <UsersRound className="size-3.5 text-indigo-600" />
                    Members ({club._count?.members ?? 0})
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(club)}
                        aria-label="Edit club"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${club.name}"?`)) {
                            deleteClubMutation.mutate(club.id);
                          }
                        }}
                        aria-label="Delete club"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editing ? "Edit Club" : "Create New Club"}
              </h3>
              <button
                onClick={closeForm}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate({ id: editing?.id, input: values });
              }}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Club Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Science & Robotics Club"
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe club purpose, weekly meeting times, or activities..."
                  value={values.description}
                  onChange={(e) => setValues({ ...values, description: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Patron / Teacher in Charge
                </label>
                <select
                  value={values.teacherInChargeId}
                  onChange={(e) => setValues({ ...values, teacherInChargeId: e.target.value })}
                  className={inputClasses}
                >
                  <option value="">No patron assigned</option>
                  {(teachersQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="clubActive"
                  checked={values.isActive}
                  onChange={(e) => setValues({ ...values, isActive: e.target.checked })}
                  className="size-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="clubActive" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Club is currently active and accepting members
                </label>
              </div>

              {saveMutation.isError && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
                  <CircleAlert className="size-4 shrink-0" />
                  {saveMutation.error?.message || "Failed to save club"}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {editing ? "Save Changes" : "Create Club"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE MEMBERS MODAL */}
      {selectedClubForMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="size-4 text-indigo-600" />
                  {selectedClubForMembers.name} — Members
                </h3>
                <p className="text-xs text-slate-500">
                  Manage student membership and executive roles
                </p>
              </div>
              <button
                onClick={() => setSelectedClubForMembers(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Add Member Form */}
            {canManage && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!memberStudentId) return;
                  addMemberMutation.mutate({
                    clubId: selectedClubForMembers.id,
                    studentId: memberStudentId,
                    role: memberRole,
                  });
                }}
                className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40"
              >
                <select
                  required
                  value={memberStudentId}
                  onChange={(e) => setMemberStudentId(e.target.value)}
                  className="h-9 min-w-48 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">Select student to enroll...</option>
                  {(studentsQuery.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.admissionNumber || s.studentId})
                    </option>
                  ))}
                </select>

                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="h-9 w-32 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="Member">Member</option>
                  <option value="President">President</option>
                  <option value="Vice President">Vice President</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Treasurer">Treasurer</option>
                  <option value="Organizer">Organizer</option>
                </select>

                <button
                  type="submit"
                  disabled={!memberStudentId || addMemberMutation.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addMemberMutation.isPending ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  Add to Club
                </button>
              </form>
            )}

            {addMemberMutation.isError && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                {addMemberMutation.error?.message || "Failed to add member"}
              </p>
            )}

            {/* Members Table */}
            <div className="mt-4 flex-1 overflow-y-auto">
              {selectedClubForMembers.members?.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No students are enrolled in this club yet. Use the form above to add members.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
                  {selectedClubForMembers.members?.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 font-bold text-indigo-700 dark:bg-indigo-950/40">
                          {m.student.profile.firstName[0]}
                          {m.student.profile.lastName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {m.student.profile.firstName} {m.student.profile.lastName}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {m.student.admissionNumber || m.student.studentId} • {m.student.house?.name ?? "No House"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          {m.role || "Member"}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => {
                              if (confirm("Remove student from this club?")) {
                                removeMemberMutation.mutate({
                                  clubId: selectedClubForMembers.id,
                                  studentId: m.studentId,
                                });
                              }
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                onClick={() => setSelectedClubForMembers(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
