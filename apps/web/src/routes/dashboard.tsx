import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SchoolSidebar } from "@/components/school/school-sidebar";
import { DashboardContent } from "@/components/school/dashboard/dashboard-content";
import { DashboardHeader } from "@/components/school/dashboard/dashboard-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import {
  useSchoolOrganization,
} from "@/components/school/school-organization";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

interface School {
  id: string;
  name: string;
  code: string;
  subdomain: string;
}

function DashboardPage() {
  const { data: session, isPending: sessionLoading } = useSession();
  const {
    activeOrganization,
    organizations,
    isPending: organizationLoading,
    selectionError,
  } = useSchoolOrganization();
  const navigate = useNavigate();
  const { data: school } = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<School>("/schools/current"),
    enabled:
      !!session?.user &&
      !!activeOrganization &&
      organizations.length === 1,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const greetingName = session?.user?.name?.split(" ")[0] ?? "there";

  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      void navigate({ to: "/login", replace: true });
    }
  }, [session, sessionLoading, navigate]);

  if (sessionLoading || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-blue-600" />
          {sessionLoading ? "Loading your workspace…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50 md:flex">
        <SchoolSidebar
          activePage="dashboard"
          schoolName={school?.name}
          userName={session?.user?.name}
          userEmail={session?.user?.email}
        />
        <div className="min-w-0 flex-1">
          <DashboardHeader
            userName={session?.user?.name}
            search={search}
            onSearchChange={setSearch}
          />
          {organizationLoading ? (
            <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              <span className="size-2 animate-pulse rounded-full bg-indigo-600" />
              Loading your school workspace…
            </div>
          ) : selectionError ? (
            <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 shadow-sm">
              {selectionError}
            </div>
          ) : organizations.length > 1 ? (
            <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <h1 className="text-lg font-bold">This account is linked to multiple schools</h1>
              <p className="mt-1 text-sm text-amber-800">
                School accounts cannot be shared across schools. Contact support to correct the memberships, then use separate credentials for each school.
              </p>
            </div>
          ) : organizations.length === 0 ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
              <h1 className="text-lg font-bold">No school workspace linked</h1>
              <p className="mt-1 text-sm text-amber-800">
                Ask a platform administrator to enroll your school and add your account as a member.
              </p>
            </div>
          ) : !activeOrganization ? (
            <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              <span className="size-2 animate-pulse rounded-full bg-indigo-600" />
              Activating your school workspace…
            </div>
          ) : (
            <DashboardContent
              today={today}
              greetingName={greetingName}
              search={search}
            />
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
