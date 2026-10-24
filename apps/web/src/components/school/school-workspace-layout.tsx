import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, LoaderCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { SchoolSidebar } from "@/components/school/school-sidebar";
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
import { DashboardNotificationsMenu } from "@/components/school/dashboard/dashboard-notifications-menu";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface School {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  logo: string | null;
  motto: string | null;
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
          <LoaderCircle className="size-4 animate-spin text-indigo-600 dark:text-indigo-400" />
          {sessionLoading ? "Loading your workspace…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 flex w-full antialiased selection:bg-indigo-500 selection:text-white">
        <SchoolSidebar
          activePage={activePage}
          schoolName={school?.name}
          schoolLogo={school?.logo}
          schoolMotto={school?.motto}
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          userImage={session?.user?.image}
        />
        
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Top Header Bar (Using the exact same responsive grid structure) */}
          <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-slate-200/60 bg-white/70 px-3 py-2.5 backdrop-blur-xl transition-all dark:border-slate-800/80 dark:bg-slate-900/70 sm:px-6 md:px-8 min-h-[4.5rem]">
            
            {/* 1. Left side: Sidebar trigger & optional desktop breadcrumb */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center rounded-xl border border-slate-200/70 bg-white/50 p-1 shadow-sm transition hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                <SidebarTrigger />
              </div>
              
              <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-800 md:block" />
              
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 min-w-0">
                <Link
                  to="/dashboard"
                  className="transition hover:text-slate-700 dark:hover:text-slate-200 shrink-0 font-medium"
                >
                  Workspace
                </Link>
                <span className="text-slate-300 dark:text-slate-700 shrink-0">/</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                  {title}
                </span>
              </div>
            </div>

            {/* 2. Center: Academic Context Switcher (Centered nicely in the white space without clipping) */}
            <div className="flex justify-center px-2 min-w-0 overflow-x-auto no-scrollbar">
              <div className="shrink-0 scale-95 sm:scale-100 origin-center">
                <AcademicContextSwitcher />
              </div>
            </div>

            {/* 3. Right side: Theme toggle, Notifications, Role switcher & Search */}
            <div className="flex items-center gap-2 justify-end">
              
              {/* Role switcher: Hidden on smaller screens, shows up on large screens */}
              <div className="hidden lg:block shrink-0">
                <SchoolRoleSwitcher />
              </div>

              {/* Search input: Hidden on mobile/tablet, full on desktop */}
              <label className="relative hidden xl:block shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  placeholder={`Search ${title.toLowerCase()}…`}
                  aria-label={`Search ${title.toLowerCase()}`}
                  className="h-9 w-48 rounded-xl border border-slate-200/80 bg-slate-100/60 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-500/50"
                />
              </label>

              <ThemeToggle />
              
              <DashboardNotificationsMenu />
            </div>
          </header>

          {/* Main Dashboard Workspace Body */}
          <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {organizationLoading && (
              <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-xs font-medium text-indigo-900 shadow-sm dark:border-indigo-950 dark:bg-indigo-950/30 dark:text-indigo-200">
                <LoaderCircle className="size-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                Loading your school workspace…
              </div>
            )}
            
            {selectionError && (
              <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-800 shadow-sm backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                {selectionError}
              </div>
            )}

            {!organizationLoading && organizations.length > 1 && (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <p className="font-bold tracking-tight">This account is linked to multiple schools.</p>
                <p className="mt-1 text-xs opacity-90 leading-relaxed">
                  School accounts cannot be shared across schools. Contact support to correct memberships, then use separate credentials for each school.
                </p>
              </div>
            )}

            {!organizationLoading &&
              organizations.length === 0 &&
              session?.user && (
                <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-bold tracking-tight">No school workspace is linked to this account.</p>
                  <p className="mt-1 text-xs opacity-90 leading-relaxed">
                    Ask a platform administrator to enroll your school and add this account as a member.
                  </p>
                </div>
              )}

            {schoolError && activeOrganization && (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-800 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
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