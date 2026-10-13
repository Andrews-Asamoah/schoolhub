import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SchoolSidebar } from "@/components/school/school-sidebar";
import { DashboardContent } from "@/components/school/dashboard/dashboard-content";
import { DashboardHeader } from "@/components/school/dashboard/dashboard-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

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
  const { data: school } = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<School>("/schools/current"),
    enabled: !!session?.user,
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

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-blue-600" />
          Loading your workspace…
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
          <DashboardContent
            today={today}
            greetingName={greetingName}
            search={search}
          />
        </div>
      </div>
    </SidebarProvider>
  );
}
