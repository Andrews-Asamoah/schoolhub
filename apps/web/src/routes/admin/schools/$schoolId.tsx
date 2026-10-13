import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { SubscriptionBadge } from "@/components/superadmin/subscription-badge";

export const Route = createFileRoute("/admin/schools/$schoolId")({
  component: SchoolDetailPage,
});

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
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

function SchoolDetailPage() {
  const { schoolId } = Route.useParams();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [newStatus, setNewStatus] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const queryClient = useQueryClient();

  const { data: school, isPending } = useQuery({
    queryKey: ["superadmin", "school", schoolId],
    queryFn: () => apiFetch<SchoolDetail>(`/super-admin/schools/${schoolId}`),
  });

  const subMutation = useMutation({
    mutationFn: (body: { status: string; expiresAt?: string }) =>
      apiFetch(`/super-admin/schools/${schoolId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["superadmin", "school", schoolId],
      });
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
    <div className="space-y-6">
      {/* Back */}
      <Link
        to="/admin/schools"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" />
        Back to Schools
      </Link>

      {/* School header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 rounded-lg py-2 text-sm font-medium transition",
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
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
      )}

      {activeTab === "admin" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Organization Members
            </h2>
          </div>
          {school.organization.members.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No members found</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {school.organization.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {m.user.name}
                    </p>
                    <p className="text-xs text-slate-500">{m.user.email}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "subscription" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

          <div className="rounded-xl border border-slate-200 p-4">
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
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {subMutation.isPending ? "Updating…" : "Update"}
              </button>
            </div>
            {statusMsg && (
              <p className="mt-2 text-xs font-medium text-emerald-600">{statusMsg}</p>
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
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
