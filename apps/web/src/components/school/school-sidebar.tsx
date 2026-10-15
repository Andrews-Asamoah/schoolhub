import { Link } from "@tanstack/react-router";
import { GraduationCap, LogOut, Sparkles, LoaderCircle } from "lucide-react";
import { useLogout } from "@/hooks/use-logout";
import { getSchoolNavGroupsForRole } from "@/lib/school-navigation";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface SchoolSidebarProps {
  activePage: string;
  schoolName?: string;
  userName?: string;
  userEmail?: string;
}

export function SchoolSidebar({
  activePage,
  schoolName,
  userName,
  userEmail,
}: SchoolSidebarProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();
  const { activeRole } = useSchoolRole();
  const navGroups = getSchoolNavGroupsForRole(activeRole ?? undefined);

  return (
    <Sidebar className="school-sidebar-shell">
      <SidebarHeader>
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <GraduationCap className="size-5" strokeWidth={2.2} />
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="school-brand-title block text-[15px] font-bold tracking-tight">
              SchoolHub
            </span>
            <span className="block text-[10px] font-medium tracking-wide text-slate-400">
              SCHOOL MANAGEMENT
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <div className="sidebar-expanded mb-6 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {schoolName ?? "Your school"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Current workspace
              </p>
            </div>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenuButton
            asChild
            active={activePage === "dashboard"}
            className="school-sidebar-nav-item"
          >
            <Link to="/dashboard">
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-blue-600 text-white">
                <GraduationCap className="size-3.5" />
              </span>
              <span className="sidebar-expanded flex-1">Overview</span>
            </Link>
          </SidebarMenuButton>
        </SidebarGroup>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <div className="space-y-1">
              {group.items.map(({ id, label, icon: Icon }) => (
                <SidebarMenuButton
                  key={id}
                  asChild
                  active={activePage === id}
                  className="school-sidebar-nav-item"
                >
                  <Link to="/$page" params={{ page: id }}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="sidebar-expanded flex-1">{label}</span>
                  </Link>
                </SidebarMenuButton>
              ))}
            </div>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="sidebar-expanded mb-3 rounded-xl bg-blue-50/80 p-3">
          <div className="mb-1.5 flex items-center gap-2 text-blue-700">
            <Sparkles className="size-3.5" />
            <span className="text-xs font-semibold">SchoolHub workspace</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            Your school&apos;s daily operations, together in one place.
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {userName?.charAt(0)?.toUpperCase() ?? "S"}
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="school-sidebar-user-name block truncate text-xs font-semibold text-slate-800">
              {userName ?? "School admin"}
            </span>
            <span className="school-sidebar-user-email block truncate text-[10px] text-slate-500">
              {userEmail ?? "Administrator"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isSigningOut}
            aria-label={isSigningOut ? "Signing out" : "Sign out"}
            title={isSigningOut ? "Signing out…" : "Sign out"}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="mt-2 px-2 text-xs text-red-600">
            {signOutError}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
