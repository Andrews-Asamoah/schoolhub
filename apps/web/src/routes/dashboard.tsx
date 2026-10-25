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
  logo: string | null;
  motto: string | null;
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
      <div className="flex min-h-screen items-center justify-center bg-background dark:bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          {sessionLoading ? "Loading your workspace…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background dark:bg-background md:flex">
        <SchoolSidebar
          activePage="dashboard"
          schoolName={school?.name}
          schoolLogo={school?.logo}     // <--- Passed logo here
          schoolMotto={school?.motto}   // <--- Passed motto here
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          userImage={session?.user?.image}
        />
        <div className="min-w-0 flex-1">
          <DashboardHeader
            userName={session?.user?.name}
            search={search}
            onSearchChange={setSearch}
          />
          {organizationLoading ? (
            <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              Loading your school workspace…
            </div>
          ) : selectionError ? (
            <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive shadow-sm">
              {selectionError}
            </div>
          ) : organizations.length > 1 ? (
            <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-2xl border border-warning/20 bg-warning/10 p-6 text-warning shadow-sm">
              <h1 className="text-lg font-bold">This account is linked to multiple schools</h1>
              <p className="mt-1 text-sm text-warning">
                School accounts cannot be shared across schools. Contact support to correct the memberships, then use separate credentials for each school.
              </p>
            </div>
          ) : organizations.length === 0 ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-warning/20 bg-warning/10 p-6 text-warning shadow-sm">
              <h1 className="text-lg font-bold">No school workspace linked</h1>
              <p className="mt-1 text-sm text-warning">
                Ask a platform administrator to enroll your school and add your account as a member.
              </p>
            </div>
          ) : !activeOrganization ? (
            <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
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