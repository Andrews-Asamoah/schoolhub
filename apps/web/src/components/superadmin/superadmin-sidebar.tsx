import { Link } from "@tanstack/react-router";
import {
  LogOut,
  LayoutDashboard,
  LoaderCircle,
  School,
  Settings,
  Shield,
} from "lucide-react";
import { useLogout } from "@/hooks/use-logout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface SuperAdminSidebarProps {
  activePage: string;
  userName?: string;
  userEmail?: string;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" as const },
  { id: "schools", label: "Schools", icon: School, to: "/admin/schools" as const },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    to: "/admin/schools" as const, // placeholder
    disabled: true,
  },
];

export function SuperAdminSidebar({
  activePage,
  userName,
  userEmail,
}: SuperAdminSidebarProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();

  return (
    <Sidebar className="border-slate-800 bg-slate-900">
      <SidebarHeader className="border-b border-slate-800 bg-slate-900">
        <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Shield className="size-5" strokeWidth={2} />
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="block text-[15px] font-bold tracking-tight text-white">
              SchoolHub
            </span>
            <span className="block text-[10px] font-semibold tracking-widest text-indigo-400">
              PLATFORM ADMIN
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="bg-slate-900">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500">
            Platform
          </SidebarGroupLabel>
          <div className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon, to, disabled }) => (
              <SidebarMenuButton
                key={id}
                asChild={!disabled}
                active={activePage === id}
                disabled={disabled}
                className={
                  activePage === id
                    ? "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/25 hover:text-indigo-200"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }
              >
                {disabled ? (
                  <span className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium">
                    <Icon className="size-[18px] shrink-0" />
                    <span className="sidebar-expanded flex-1">{label}</span>
                    <span className="sidebar-expanded rounded bg-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                      Soon
                    </span>
                  </span>
                ) : (
                  <Link to={to}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="sidebar-expanded flex-1">{label}</span>
                  </Link>
                )}
              </SidebarMenuButton>
            ))}
          </div>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-slate-800 bg-slate-900">
        {signOutError && (
          <p role="alert" className="mb-2 px-2 text-xs text-red-400">
            {signOutError}
          </p>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
            {userName?.charAt(0)?.toUpperCase() ?? "A"}
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-200">
              {userName ?? "Super Admin"}
            </span>
            <span className="block truncate text-[10px] text-slate-500">
              {userEmail ?? "admin@schoolhub.gh"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isSigningOut}
            aria-label={isSigningOut ? "Signing out" : "Sign out"}
            title={isSigningOut ? "Signing out…" : "Sign out"}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-950/60 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="mt-2 px-2 text-xs text-red-400">
            {signOutError}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
