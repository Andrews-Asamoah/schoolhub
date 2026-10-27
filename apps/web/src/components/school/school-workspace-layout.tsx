import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { SchoolSidebar } from "@/components/school/school-sidebar";
import { PageContainer } from "@/components/ui/page-container";
import { AcademicContextSwitcher } from "@/components/school/academic-context-switcher";
import {
  useSchoolOrganization,
} from "@/components/school/school-organization";
import { SchoolRoleSwitcher } from "@/components/school/school-role-switcher";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { TwoFactorNudge } from "./two-factor-nudge";
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          {sessionLoading ? "Loading your workspace…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex w-full antialiased selection:bg-primary/20 selection:text-foreground">
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
          <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border/70 bg-card/85 px-3 py-2.5 backdrop-blur-xl transition-all  sm:px-6 md:px-8 min-h-[4.5rem]">
            
            {/* 1. Left side: Sidebar trigger & optional desktop breadcrumb */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm transition hover:bg-accent">
                <SidebarTrigger />
              </div>
              
              <span className="hidden h-4 w-px bg-border md:block" />
              
              <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                <Link
                  to="/dashboard"
                  className="transition hover:text-foreground shrink-0 font-medium"
                >
                  Workspace
                </Link>
                <span className="text-muted-foreground/50 shrink-0">/</span>
                <span className="font-semibold text-foreground truncate max-w-[200px]">
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

            {/* 3. Right side: Theme toggle, Notifications and Role switcher */}
            <div className="flex items-center gap-2 justify-end">
              
              {/* Role switcher: Hidden on smaller screens, shows up on large screens */}
              <div className="min-w-0 shrink-0">
                <SchoolRoleSwitcher />
              </div>

              <ThemeToggle />
              
              <DashboardNotificationsMenu />
            </div>
          </header>

          {/* Main Dashboard Workspace Body */}
          <PageContainer>
            <TwoFactorNudge />

            {organizationLoading && (
              <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-medium text-primary shadow-sm">
                <LoaderCircle className="size-3.5 animate-spin text-primary" />
                Loading your school workspace…
              </div>
            )}
            
            {selectionError && (
              <div role="alert" className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive shadow-sm backdrop-blur-sm ">
                {selectionError}
              </div>
            )}

            {!organizationLoading && organizations.length > 1 && (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-warning/20 bg-warning/10 px-5 py-4 text-sm text-warning shadow-sm backdrop-blur-sm "
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
                <div role="alert" className="mb-6 rounded-2xl border border-warning/20 bg-warning/10 px-5 py-4 text-sm text-warning shadow-sm backdrop-blur-sm ">
                  <p className="font-bold tracking-tight">No school workspace is linked to this account.</p>
                  <p className="mt-1 text-xs opacity-90 leading-relaxed">
                    Ask a platform administrator to enroll your school and add this account as a member.
                  </p>
                </div>
              )}

            {schoolError && activeOrganization && (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive shadow-sm "
              >
                School details could not be loaded: {schoolError.message}
              </div>
            )}

            {!organizationLoading &&
              organizations.length === 1 &&
              activeOrganization &&
              children}
          </PageContainer>
        </div>
      </div>
    </SidebarProvider>
  );
}