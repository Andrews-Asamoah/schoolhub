import { DashboardNotificationsMenu } from "@/components/school/dashboard/dashboard-notifications-menu";
import { AcademicContextSwitcher } from "@/components/school/academic-context-switcher";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { SchoolRoleSwitcher } from "@/components/school/school-role-switcher";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-10 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border bg-card/90 px-3 py-2.5 backdrop-blur  sm:px-6 md:px-8 min-h-[4.5rem]">
      
      {/* 1. Left side: Sidebar trigger & Workspace breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <span className="hidden h-5 w-px bg-border md:block" />
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-medium text-foreground">Overview</span>
        </div>
      </div>

      {/* 2. Center: Academic Context Switcher (Fully responsive grid cell, centers and scales safely without clipping) */}
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

        {/* Theme Toggle Button */}
        <ThemeToggle />

        <DashboardNotificationsMenu />
      </div>
    </header>
  );
}