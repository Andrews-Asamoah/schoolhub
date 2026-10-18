import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  Users,
  GraduationCap,
  Globe,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  CircleAlert,
  UserPlus,
  Ban,
  Trash2,
  Check,
  ShieldAlert,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { IssuedCredentials } from "@schoolhub/shared";
import {
  CredentialsDialog,
  type CredentialEntry,
} from "@/components/credentials/credentials-dialog";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";

export const Route = createFileRoute("/admin/schools/$schoolId")({
  component: SchoolDetailPage,
});

interface Member {
  id: string;
  role: string;
  banned: boolean;
  user: { id: string; name: string; email: string; banned?: boolean };
}

interface SchoolDetail {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  organization: {
    id: string;
    subscriptionStatus: string;
    expiresAt: string | null;
    metadata: string | null;
    members: Member[];
  };
  students: { id: string }[];
  teachers: { id: string }[];
  academicYears: { id: string; name: string; isCurrent: boolean }[];
}

const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "SUSPENDED",
] as const;

type Tab = "overview" | "admin" | "subscription";
type AdminAction = "ban" | "unban" | "remove";

interface AdminConfirmation {
  userId: string;
  name: string;
  action: AdminAction;
}

interface SchoolForm {
  schoolName: string;
  schoolCode: string;
  subdomain: string;
  schoolEmail: string;
  schoolPhone: string;
  schoolAddress: string;
}

function SchoolDetailPage() {
  const { schoolId } = Route.useParams();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [newStatus, setNewStatus] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [schoolForm, setSchoolForm] = useState<SchoolForm>({
    schoolName: "",
    schoolCode: "",
    subdomain: "",
    schoolEmail: "",
    schoolPhone: "",
    schoolAddress: "",
  });
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [issued, setIssued] = useState<CredentialEntry[]>([]);
  const [adminConfirmation, setAdminConfirmation] =
    useState<AdminConfirmation | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  const { data: school, isPending } = useQuery({
    queryKey: ["superadmin", "school", schoolId],
    queryFn: () => apiFetch<SchoolDetail>(`/super-admin/schools/${schoolId}`),
  });

  useEffect(() => {
    if (!school) return;
    setSchoolForm({
      schoolName: school.name,
      schoolCode: school.code,
      subdomain: school.subdomain,
      schoolEmail: school.email ?? "",
      schoolPhone: school.phone ?? "",
      schoolAddress: school.address ?? "",
    });
  }, [school]);

  function refreshSchoolData() {
    void queryClient.invalidateQueries({
      queryKey: ["superadmin", "school", schoolId],
    });
    void queryClient.invalidateQueries({ queryKey: ["superadmin", "schools"] });
    void queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
  }

  function openAdminConfirmation(confirmation: AdminConfirmation) {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAdminConfirmation(confirmation);
  }

  function closeAdminConfirmation() {
    setAdminConfirmation(null);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  const schoolMutation = useMutation({
    mutationFn: (body: SchoolForm) =>
      apiFetch<SchoolDetail>(`/super-admin/schools/${schoolId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
          schoolEmail: body.schoolEmail || undefined,
          schoolPhone: body.schoolPhone || undefined,
          schoolAddress: body.schoolAddress || undefined,
        }),
      }),
    onSuccess: () => {
      refreshSchoolData();
    },
  });

  const addAdminMutation = useMutation({
    mutationFn: (body: { name: string; email: string }) =>
      apiFetch<{
        admin: { name: string; email: string };
        createdAccount: boolean;
        credentials: IssuedCredentials | null;
      }>(
        `/super-admin/schools/${schoolId}/admins`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: (result) => {
      refreshSchoolData();
      if (result.credentials) {
        setIssued([
          {
            label: `${result.admin.name} (school admin)`,
            credentials: result.credentials,
          },
        ]);
      }
      setAdminMessage(
        result.createdAccount
          ? `${result.admin.name} was added. Their default password was shown; they must change it at first sign-in.`
          : `${result.admin.name} was added using their existing account.`,
      );
      setAdminName("");
      setAdminEmail("");
    },
  });

  const adminActionMutation = useMutation({
    mutationFn: ({
      userId,
      action,
    }: {
      userId: string;
      action: "ban" | "unban" | "remove";
    }) =>
      apiFetch(
        `/super-admin/schools/${schoolId}/admins/${userId}`,
        action === "remove"
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              body: JSON.stringify({ banned: action === "ban" }),
            },
      ),
    onSuccess: () => {
      refreshSchoolData();
      setAdminMessage("School administrator access was updated.");
      closeAdminConfirmation();
    },
  });

  useEffect(() => {
    if (!adminConfirmation) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [adminConfirmation]);

  useEffect(() => {
    if (!adminConfirmation) return;

    cancelConfirmationRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !adminActionMutation.isPending) {
        closeAdminConfirmation();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [adminConfirmation, adminActionMutation.isPending]);

  const subMutation = useMutation({
    mutationFn: (body: { status: string; expiresAt?: string }) =>
      apiFetch(`/super-admin/schools/${schoolId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      refreshSchoolData();
      setStatusMsg("Subscription updated!");
      setTimeout(() => setStatusMsg(""), 3000);
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
          Loading school…
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-slate-500">School not found</p>
        <Link to="/admin/schools" className="mt-3 text-xs text-indigo-600 hover:underline">
          Back to schools
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "admin", label: "Admin" },
    { id: "subscription", label: "Subscription" },
  ];

  return (
    <div className="superadmin-detail-page space-y-6">
      {/* Back */}
      <Link
        to="/admin/schools"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" />
        Back to Schools
      </Link>

      {/* School header */}
      <div className="superadmin-surface rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {school.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                {school.code}
              </code>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                {school.subdomain}
              </span>
              <SubscriptionBadge status={school.organization.subscriptionStatus} />
            </div>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900">{school.students.length}</p>
              <p className="text-xs text-slate-400">Students</p>
            </div>
            <div className="w-px bg-slate-200" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{school.teachers.length}</p>
              <p className="text-xs text-slate-400">Teachers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="superadmin-surface flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 rounded-lg py-2 text-sm font-medium transition",
              `superadmin-tab flex-1 rounded-lg py-2 text-sm transition ${
                activeTab === tab.id
                  ? "bg-indigo-600 font-semibold text-white shadow-sm dark:bg-indigo-400/20 dark:text-indigo-100 dark:ring-1 dark:ring-indigo-300/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`,
            ].join(" ")}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              schoolMutation.mutate(schoolForm);
            }}
            className="superadmin-surface rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">School profile</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Edit the school's directory and contact information.
                </p>
              </div>
              <button
                type="submit"
                disabled={schoolMutation.isPending}
                className="superadmin-button-primary inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Check className="size-4" />
                {schoolMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
            {schoolMutation.isSuccess && (
              <p className="mb-4 text-xs font-medium text-emerald-700">School profile saved.</p>
            )}
            {schoolMutation.error && (
              <p role="alert" className="mb-4 text-xs text-rose-700">
                Could not save school profile: {schoolMutation.error.message}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="School name">
                <input required minLength={2} value={schoolForm.schoolName} onChange={(event) => setSchoolForm({ ...schoolForm, schoolName: event.target.value })} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="School code">
                <input required minLength={3} maxLength={20} pattern="[A-Z0-9-]+" value={schoolForm.schoolCode} onChange={(event) => setSchoolForm({ ...schoolForm, schoolCode: event.target.value.toUpperCase() })} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="Subdomain">
                <input required minLength={3} maxLength={30} pattern="[a-z0-9-]+" value={schoolForm.subdomain} onChange={(event) => setSchoolForm({ ...schoolForm, subdomain: event.target.value.toLowerCase() })} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="School email">
                <input type="email" value={schoolForm.schoolEmail} onChange={(event) => setSchoolForm({ ...schoolForm, schoolEmail: event.target.value })} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="Phone">
                <input value={schoolForm.schoolPhone} onChange={(event) => setSchoolForm({ ...schoolForm, schoolPhone: event.target.value })} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="Address">
                <input value={schoolForm.schoolAddress} onChange={(event) => setSchoolForm({ ...schoolForm, schoolAddress: event.target.value })} className={profileInputClass} />
              </ProfileField>
            </div>
          </form>
          <div className="grid gap-5 sm:grid-cols-2">
          <InfoCard
            icon={Mail}
            label="Email"
            value={school.email ?? "Not set"}
          />
          <InfoCard
            icon={Phone}
            label="Phone"
            value={school.phone ?? "Not set"}
          />
          <InfoCard
            icon={MapPin}
            label="Address"
            value={school.address ?? "Not set"}
          />
          <InfoCard
            icon={Globe}
            label="Subdomain"
            value={`${school.subdomain}.schoolhub.gh`}
          />
          <InfoCard
            icon={Users}
            label="Students"
            value={`${school.students.length} enrolled`}
          />
          <InfoCard
            icon={GraduationCap}
            label="Teachers"
            value={`${school.teachers.length} registered`}
          />
          <InfoCard
            icon={CalendarDays}
            label="Current Academic Year"
            value={
              school.academicYears.find((y) => y.isCurrent)?.name ?? "None set"
            }
          />
          <InfoCard
            icon={Building2}
            label="Enrolled"
            value={new Date(school.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          />
          </div>
        </div>
      )}

      {activeTab === "admin" && (
        <div className="space-y-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addAdminMutation.mutate({ name: adminName, email: adminEmail });
            }}
            className="superadmin-surface rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900">Add a school administrator</h2>
              <p className="mt-1 text-xs text-slate-500">
                Existing accounts keep their current password. New accounts receive the current default password.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <ProfileField label="Full name">
                <input required minLength={2} value={adminName} onChange={(event) => setAdminName(event.target.value)} className={profileInputClass} />
              </ProfileField>
              <ProfileField label="Email">
                <input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className={profileInputClass} />
              </ProfileField>
              <button
                type="submit"
                disabled={addAdminMutation.isPending}
                className="superadmin-button-primary inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <UserPlus className="size-4" />
                {addAdminMutation.isPending ? "Adding…" : "Add admin"}
              </button>
            </div>
            {(addAdminMutation.error || adminActionMutation.error) && (
              <p role="alert" className="mt-3 flex items-center gap-2 text-xs text-rose-700">
                <CircleAlert className="size-4" />
                {addAdminMutation.error?.message ?? adminActionMutation.error?.message}
              </p>
            )}
            <CredentialsDialog entries={issued} onClose={() => setIssued([])} />
            {adminMessage && <p role="status" className="mt-3 text-xs font-medium text-emerald-700">{adminMessage}</p>}
          </form>

          <section className="superadmin-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">School administrators</h2>
              <p className="mt-1 text-xs text-slate-500">
                Ban or remove access for this school only. At least one active administrator must remain.
              </p>
            </div>
            {school.organization.members.filter((member) => ["owner", "admin"].includes(member.role)).length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No administrators found.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {school.organization.members
                  .filter((member) => ["owner", "admin"].includes(member.role))
                  .map((member) => {
                    const activeAdmins = school.organization.members.filter(
                      (candidate) =>
                        ["owner", "admin"].includes(candidate.role) &&
                        !candidate.banned &&
                        !candidate.user.banned,
                    ).length;
                    const isActive = !member.banned && !member.user.banned;
                    const lastActiveAdmin = isActive && activeAdmins <= 1;
                    return (
                      <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{member.user.name}</p>
                          <p className="text-xs text-slate-500">{member.user.email}</p>
                          <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                            {member.user.banned ? "Account banned" : member.banned ? "Banned for this school" : member.role}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={adminActionMutation.isPending || (isActive && lastActiveAdmin)}
                            onClick={() =>
                              member.banned
                                ? adminActionMutation.mutate({
                                    userId: member.user.id,
                                    action: "unban",
                                  })
                                : openAdminConfirmation({
                                    userId: member.user.id,
                                    name: member.user.name,
                                    action: "ban",
                                  })
                            }
                            title={isActive && lastActiveAdmin ? "Keep at least one active school admin" : undefined}
                            className="superadmin-button-warning inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Ban className="size-3.5" />
                            {member.banned ? "Restore access" : "Ban"}
                          </button>
                          <button
                            type="button"
                            disabled={adminActionMutation.isPending || (isActive && lastActiveAdmin)}
                            onClick={() =>
                              openAdminConfirmation({
                                userId: member.user.id,
                                name: member.user.name,
                                action: "remove",
                              })
                            }
                            title={isActive && lastActiveAdmin ? "Keep at least one active school admin" : undefined}
                            className="superadmin-button-danger inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      )}

      {activeTab === "subscription" && (
        <div className="superadmin-surface rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Subscription Management
          </h2>
          <div className="mb-6 flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-medium text-slate-500">Current Status</p>
              <div className="mt-1">
                <SubscriptionBadge status={school.organization.subscriptionStatus} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Expires At</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {school.organization.expiresAt
                  ? new Date(school.organization.expiresAt).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "long", year: "numeric" },
                    )
                  : "No expiry set"}
              </p>
            </div>
          </div>

          <div className="superadmin-surface rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Update Subscription
            </h3>
            <div className="flex flex-wrap gap-3">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Select new status…</option>
                {SUBSCRIPTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Expiry date (optional)"
              />
              <button
                type="button"
                disabled={!newStatus || subMutation.isPending}
                onClick={() =>
                  subMutation.mutate({
                    status: newStatus,
                    expiresAt: expiresAt || undefined,
                  })
                }
                className="superadmin-button-primary rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {subMutation.isPending ? "Updating…" : "Update"}
              </button>
            </div>
            {statusMsg && (
              <p className="mt-2 text-xs font-medium text-emerald-600">{statusMsg}</p>
            )}

            {adminConfirmation && (
              <div
                className="superadmin-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
                onMouseDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    !adminActionMutation.isPending
                  ) {
                    closeAdminConfirmation();
                  }
                }}
              >
                <div
                  aria-labelledby="admin-confirmation-title"
                  aria-describedby="admin-confirmation-description"
                  aria-modal="true"
                  className="superadmin-confirm-dialog relative w-full max-w-md overflow-hidden rounded-3xl border p-6 shadow-2xl sm:p-7"
                  onKeyDown={(event) => {
                    if (event.key !== "Tab") return;
                    const buttons =
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button:not([disabled])",
                      );
                    const first = buttons[0];
                    const last = buttons[buttons.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                      event.preventDefault();
                      last?.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                      event.preventDefault();
                      first?.focus();
                    }
                  }}
                  role="dialog"
                  tabIndex={-1}
                >
                  <button
                    type="button"
                    aria-label="Close confirmation dialog"
                    onClick={closeAdminConfirmation}
                    disabled={adminActionMutation.isPending}
                    className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                  <span
                    className={`mb-5 flex size-12 items-center justify-center rounded-2xl ring-1 ${
                      adminConfirmation.action === "remove"
                        ? "bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-300/15"
                        : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/15"
                    }`}
                  >
                    {adminConfirmation.action === "remove" ? (
                      <Trash2 className="size-5" />
                    ) : (
                      <ShieldAlert className="size-5" />
                    )}
                  </span>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                    Confirm admin access change
                  </p>
                  <h2
                    id="admin-confirmation-title"
                    className="mt-2 pr-7 text-xl font-bold tracking-tight text-slate-900 dark:text-white"
                  >
                    {adminConfirmation.action === "remove"
                      ? "Remove this administrator?"
                      : "Ban this administrator?"}
                  </h2>
                  <p
                    id="admin-confirmation-description"
                    className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {adminConfirmation.action === "remove" ? (
                      <>
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {adminConfirmation.name}
                        </strong>{" "}
                        will lose membership in this school. Their account and access to
                        any other schools will remain unchanged.
                      </>
                    ) : (
                      <>
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {adminConfirmation.name}
                        </strong>{" "}
                        will be blocked from this school only. Their user account and
                        access to other schools will remain unchanged.
                      </>
                    )}
                  </p>
                  {adminActionMutation.error && (
                    <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-300/15 dark:bg-rose-400/10 dark:text-rose-200">
                      {adminActionMutation.error.message}
                    </p>
                  )}
                  <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      ref={cancelConfirmationRef}
                      type="button"
                      disabled={adminActionMutation.isPending}
                      onClick={closeAdminConfirmation}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={adminActionMutation.isPending}
                      onClick={() =>
                        adminActionMutation.mutate({
                          userId: adminConfirmation.userId,
                          action: adminConfirmation.action,
                        })
                      }
                      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                        adminConfirmation.action === "remove"
                          ? "bg-rose-600 shadow-rose-900/20 hover:bg-rose-700 focus-visible:ring-rose-400 dark:bg-rose-500 dark:hover:bg-rose-400"
                          : "bg-amber-600 shadow-amber-900/20 hover:bg-amber-700 focus-visible:ring-amber-400 dark:bg-amber-500 dark:hover:bg-amber-400"
                      }`}
                    >
                      {adminActionMutation.isPending ? (
                        "Applying…"
                      ) : adminConfirmation.action === "remove" ? (
                        <>
                          <Trash2 className="size-4" />
                          Remove admin
                        </>
                      ) : (
                        <>
                          <Ban className="size-4" />
                          Ban from school
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="superadmin-surface flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

const profileInputClass =
  "superadmin-input mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:border-indigo-300 dark:focus:ring-indigo-300/20";

function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}
