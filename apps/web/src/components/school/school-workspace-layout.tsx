import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { SchoolSidebar } from "@/components/school/school-sidebar";
import { HeaderAccountLink } from "@/components/school/header-account-link";
import { AcademicContextSwitcher } from "@/components/school/academic-context-switcher";
import {
  useSchoolOrganization,
} from "@/components/school/school-organization";
import {
  SchoolRoleSwitcher,
  schoolRoleLabel,
  useSchoolRole,
} from "@/components/school/school-role-switcher";
import { ThemeToggle } from "@/components/school/theme-toggle";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface School {
  id: string;
  name: string;
  code: string;
  subdomain: string;
}

interface SchoolWorkspaceLayoutProps {
  activePage: string;
  title: string;
  section: string;
  children: ReactNode;
}

export function SchoolWorkspaceLayout({
  activePage,
  title,
  section,
  children,
}: SchoolWorkspaceLayoutProps) {
  const { data: session, isPending: sessionLoading } = useSession();
  const {
    activeOrganization,
    organizations,
    isPending: organizationLoading,
    selectionError,
  } = useSchoolOrganization();
  const { activeRole } = useSchoolRole();
  const navigate = useNavigate();
  const { data: school, error: schoolError } = useQuery({
    queryKey: ["school", "current"],
    queryFn: () => apiFetch<School>("/schools/current"),
    enabled:
      !!session?.user &&
      !!activeOrganization &&
      organizations.length === 1,
    retry: false,
  });

  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      void navigate({ to: "/login", replace: true });
    }
  }, [session, sessionLoading, navigate]);

  if (sessionLoading || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-blue-600" />
          {sessionLoading ? "Loading your workspace…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-background md:flex">
        <SchoolSidebar
          activePage={activePage}
          schoolName={school?.name}
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          userImage={session?.user?.image}
        />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-[4.5rem] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <span className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
              <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
                <Link
                  to="/dashboard"
                  className="transition hover:text-slate-700"
                >
                  Workspace
                </Link>
                <span>/</span>
                <span className="font-medium text-slate-700">{title}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <AcademicContextSwitcher />
              <SchoolRoleSwitcher />
              <label className="relative hidden md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder={`Search ${title.toLowerCase()}`}
                  aria-label={`Search ${title.toLowerCase()}`}
                  className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
              </label>
              <ThemeToggle />
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Bell className="size-[18px]" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
              </button>
              <span className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
              <HeaderAccountLink subtitle={`${schoolRoleLabel(activeRole)} · ${section}`} />
            </div>
          </header>
          <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">
            {organizationLoading && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
                <span className="size-2 animate-pulse rounded-full bg-indigo-600" />
                Loading your school workspace…
              </div>
            )}
            {selectionError && (
              <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                {selectionError}
              </div>
            )}
            {!organizationLoading && organizations.length > 1 && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 shadow-sm"
              >
                <p className="font-semibold">This account is linked to multiple schools.</p>
                <p className="mt-1 text-xs">
                  School accounts cannot be shared across schools. Contact support to correct the memberships, then use separate credentials for each school.
                </p>
              </div>
            )}
            {!organizationLoading &&
              organizations.length === 0 &&
              session?.user && (
                <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 shadow-sm">
                  <p className="font-semibold">No school workspace is linked to this account.</p>
                  <p className="mt-1 text-xs">
                    Ask a platform administrator to enroll your school and add this account as a member.
                  </p>
                </div>
              )}
            {schoolError && activeOrganization && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
              >
                School details could not be loaded: {schoolError.message}
              </div>
            )}
            {!organizationLoading &&
              organizations.length === 1 &&
              activeOrganization &&
              children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
