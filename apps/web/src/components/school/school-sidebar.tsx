import { Link } from "@tanstack/react-router";
import { GraduationCap, LogOut, Sparkles } from "lucide-react";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { schoolNavGroups } from "@/lib/school-navigation";
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
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    const result = await signOut();
    if (result.error) {
      setSignOutError(result.error.message ?? "Could not sign out.");
    }
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <GraduationCap className="size-5" strokeWidth={2.2} />
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="block text-[15px] font-bold tracking-tight text-slate-900">
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
          <SidebarMenuButton asChild active={activePage === "dashboard"}>
            <Link to="/dashboard">
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-blue-600 text-white">
                <GraduationCap className="size-3.5" />
              </span>
              <span className="sidebar-expanded flex-1">Overview</span>
            </Link>
          </SidebarMenuButton>
        </SidebarGroup>

        {schoolNavGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <div className="space-y-1">
              {group.items.map(({ id, label, icon: Icon }) => (
                <SidebarMenuButton key={id} asChild active={activePage === id}>
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
        {signOutError && (
          <p role="alert" className="mb-2 px-2 text-xs text-red-600">
            {signOutError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-slate-50"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {userName?.charAt(0)?.toUpperCase() ?? "S"}
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-800">
              {userName ?? "School admin"}
            </span>
            <span className="block truncate text-[10px] text-slate-500">
              {userEmail ?? "Administrator"}
            </span>
          </span>
          <LogOut className="sidebar-expanded size-4 shrink-0 text-slate-400" />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
