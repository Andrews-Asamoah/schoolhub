import { type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./superadmin-sidebar";

interface SuperAdminLayoutProps {
  children: ReactNode;
  activePage: string;
  userName?: string;
  userEmail?: string;
  breadcrumb?: string;
}

export function SuperAdminLayout({
  children,
  activePage,
  userName,
  userEmail,
  breadcrumb,
}: SuperAdminLayoutProps) {
  return (
    <SidebarProvider>
      <div className="superadmin-app-shell min-h-screen md:flex">
        <SuperAdminSidebar
          activePage={activePage}
          userName={userName}
          userEmail={userEmail}
        />
        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <header className="superadmin-topbar sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white px-4 md:px-7 dark:border-white/[0.07] dark:bg-slate-950/45">
            <SidebarTrigger className="superadmin-button-secondary shrink-0" />
            <div className="h-4 w-px bg-slate-200 dark:bg-white/10" />
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden font-medium text-slate-500 sm:block">Platform</span>
              {breadcrumb && (
                <>
                  <span className="hidden text-slate-300 dark:text-slate-600 sm:block">/</span>
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{breadcrumb}</span>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <ThemeToggle className="superadmin-button-secondary" />
              <span className="hidden h-6 w-px bg-slate-200 dark:bg-white/10 sm:block" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm dark:border-indigo-300/15 dark:bg-indigo-400/10 dark:text-indigo-200 sm:text-xs">
                <span className="size-1.5 rounded-full bg-indigo-500" />
                <span className="hidden sm:inline">Super Admin</span>
                <ShieldCheck className="size-3.5 sm:hidden" />
              </span>
            </div>
          </header>
          {/* Page content */}
          <main className="superadmin-main mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
