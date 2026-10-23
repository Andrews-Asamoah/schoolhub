import { Bell, Search } from "lucide-react";
import { AcademicContextSwitcher } from "@/components/school/academic-context-switcher";
import { ThemeToggle } from "@/components/school/theme-toggle";
import {
  SchoolRoleSwitcher,
  schoolRoleLabel,
  useSchoolRole,
} from "@/components/school/school-role-switcher";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardHeaderProps {
  userName?: string | null;
  search: string;
  onSearchChange: (value: string) => void;
}

export function DashboardHeader({
  search,
  onSearchChange,
}: DashboardHeaderProps) {
  const { activeRole } = useSchoolRole();

  return (
    <header className="sticky top-0 z-10 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-slate-200/80 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6 md:px-8 min-h-[4.5rem]">
      
      {/* 1. Left side: Sidebar trigger & Workspace breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <span className="hidden h-5 w-px bg-slate-200 dark:bg-slate-800 md:block" />
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Overview</span>
        </div>
      </div>

      {/* 2. Center: Academic Context Switcher (Fully responsive grid cell, centers and scales safely without clipping) */}
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
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search overview"
            aria-label="Search dashboard cards"
            className="h-9 w-48 rounded-xl border border-slate-200/80 bg-slate-50/50 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-900"
          />
        </label>

        {/* Theme Toggle Button */}
        <ThemeToggle />

        {/* Notifications Button */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
          </span>
        </button>
      </div>
    </header>
  );
}