import { Bell, Search } from "lucide-react";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardHeaderProps {
  userName?: string | null;
  search: string;
  onSearchChange: (value: string) => void;
}

export function DashboardHeader({
  userName,
  search,
  onSearchChange,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-[4.5rem] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <span className="hidden h-5 w-px bg-slate-200 sm:block" />
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-medium text-slate-700">Overview</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <label className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search overview"
            aria-label="Search dashboard cards"
            className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <ThemeToggle />
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <div className="hidden text-right sm:block">
          <p className="text-xs font-semibold text-slate-800">
            {userName ?? "School admin"}
          </p>
          <p className="text-[10px] text-slate-500">Administrator</p>
        </div>
      </div>
    </header>
  );
}
