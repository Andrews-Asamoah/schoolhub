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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total School Clubs</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-foreground">{totalClubs}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Co-curricular associations</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Active Clubs</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-success/10 text-success">
              <UserCheck className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-success">{activeClubs}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Open for student membership</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Student Enrollments</span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-foreground">{totalMembers}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Members across all clubs</p>
        </div>
      </div>

      {/* Action Header & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search clubs, patrons..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-9 w-60 rounded-xl border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-primary"
            />
          </div>

          <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-xs">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === mode
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
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
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Club
          </button>
        )}
      </div>

      {/* Clubs List / Grid */}
      {clubsQuery.isLoading ? (
        <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
          <LoaderCircle className="mr-2 size-5 animate-spin text-primary" />
          Loading school clubs…
        </div>
      ) : filteredClubs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Sparkles className="mx-auto size-10 text-primary" />
          <h3 className="mt-3 text-sm font-bold text-foreground">No clubs found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchFilter || statusFilter !== "ALL"
              ? "Try adjusting your search filters."
              : "Get started by adding your school's clubs and societies."}
          </p>
          {canManage && !searchFilter && statusFilter === "ALL" && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
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
                className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition hover:border-input"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                        <Sparkles className="size-5" />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{club.name}</h4>
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                            club.isActive
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {club.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {club.description || "No description provided for this club."}
                  </p>

                  <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground/70">Teacher Patron:</span>
                      <span className="font-semibold text-foreground truncate max-w-44">
                        {patronName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground/70">Members Enrolled:</span>
                      <span className="font-bold text-primary">
                        {club._count?.members ?? 0} students
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <button
                    onClick={() => setSelectedClubForMembers(club)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/80 hover:bg-muted/50"
                  >
                    <UsersRound className="size-3.5 text-primary" />
                    Members ({club._count?.members ?? 0})
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(club)}
                        aria-label="Edit club"
                        className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground/80"
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
                        className="rounded-lg p-1.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-base font-bold text-foreground">
                {editing ? "Edit Club" : "Create New Club"}
              </h3>
              <button
                onClick={closeForm}
                className="rounded-lg p-1 text-muted-foreground/70 hover:bg-muted"
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
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Patron / Teacher in Charge
                </label>
                <Select value={values.teacherInChargeId || "__none__"} onValueChange={(value) => setValues({ ...values, teacherInChargeId: value === "__none__" ? "" : value })}>
                  <SelectTrigger aria-label="Patron / teacher in charge" className={inputClasses}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No patron assigned</SelectItem>
                    {(teachersQuery.data ?? []).map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="clubActive"
                  checked={values.isActive}
                  onChange={(e) => setValues({ ...values, isActive: e.target.checked })}
                  className="size-4 rounded-sm border-input text-primary focus:ring-primary"
                />
                <label htmlFor="clubActive" className="text-xs font-semibold text-foreground/80">
                  Club is currently active and accepting members
                </label>
              </div>

              {saveMutation.isError && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <CircleAlert className="size-4 shrink-0" />
                  {saveMutation.error?.message || "Failed to save club"}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground/80 hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  {selectedClubForMembers.name} — Members
                </h3>
                <p className="text-xs text-muted-foreground">
                  Manage student membership and executive roles
                </p>
              </div>
              <button
                onClick={() => setSelectedClubForMembers(null)}
                className="rounded-lg p-1 text-muted-foreground/70 hover:bg-muted"
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
                className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3"
              >
                <Select value={memberStudentId || "__none__"} onValueChange={(value) => setMemberStudentId(value === "__none__" ? "" : value)}>
                  <SelectTrigger aria-label="Select student to enroll" className="h-9 min-w-48 flex-1"><SelectValue placeholder="Select student to enroll..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select student to enroll...</SelectItem>
                    {(studentsQuery.data ?? []).map((student) => <SelectItem key={student.id} value={student.id}>{student.firstName} {student.lastName} ({student.admissionNumber || student.studentId})</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={memberRole} onValueChange={setMemberRole}>
                  <SelectTrigger aria-label="Club member role" className="h-9 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Member">Member</SelectItem>
                    <SelectItem value="President">President</SelectItem>
                    <SelectItem value="Vice President">Vice President</SelectItem>
                    <SelectItem value="Secretary">Secretary</SelectItem>
                    <SelectItem value="Treasurer">Treasurer</SelectItem>
                    <SelectItem value="Organizer">Organizer</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  type="submit"
                  disabled={!memberStudentId || addMemberMutation.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
              <p className="mt-2 text-xs font-medium text-destructive">
                {addMemberMutation.error?.message || "Failed to add member"}
              </p>
            )}

            {/* Members Table */}
            <div className="mt-4 flex-1 overflow-y-auto">
              {selectedClubForMembers.members?.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No students are enrolled in this club yet. Use the form above to add members.
                </div>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border/80">
                  {selectedClubForMembers.members?.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">
                          {m.student.profile.firstName[0]}
                          {m.student.profile.lastName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">
                            {m.student.profile.firstName} {m.student.profile.lastName}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70">
                            {m.student.admissionNumber || m.student.studentId} • {m.student.house?.name ?? "No House"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
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
                            className="rounded-lg p-1 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
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

            <div className="mt-4 flex justify-end border-t border-border/60 pt-3">
              <button
                onClick={() => setSelectedClubForMembers(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground/80 hover:bg-muted/50"
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
