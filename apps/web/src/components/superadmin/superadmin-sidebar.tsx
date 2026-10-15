import { Link } from "@tanstack/react-router";
import {
  LogOut,
  LayoutDashboard,
  LoaderCircle,
  School,
  Shield,
  Users,
  CreditCard,
  UserCircle,
  LifeBuoy,
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

const navSections = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" as const },
    ],
  },
  {
    title: "Platform management",
    items: [
      { id: "schools", label: "Schools directory", icon: School, to: "/admin/schools" as const },
      { id: "users", label: "System users", icon: Users, to: "/admin/users" as const },
      { id: "subscriptions", label: "Subscriptions", icon: CreditCard, to: "/admin/subscriptions" as const },
      { id: "support", label: "Support desk", icon: LifeBuoy, to: "/admin/support" as const },
    ],
  },
  {
    title: "Personal",
    items: [
      { id: "profile", label: "My profile", icon: UserCircle, to: "/admin/profile" as const },
    ],
  },
];

export function SuperAdminSidebar({
  activePage,
  userName,
  userEmail,
}: SuperAdminSidebarProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();

  return (
    <Sidebar className="superadmin-sidebar-shell border-r border-slate-200 shadow-md shadow-slate-900/5 dark:border-white/10 dark:shadow-black/20">
      <SidebarHeader className="superadmin-sidebar-panel border-b border-slate-200/80 dark:border-white/10">
        <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
            <Shield className="size-5" strokeWidth={2} />
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="superadmin-brand-title block text-[15px] font-bold tracking-tight">
              SchoolHub
            </span>
            <span className="block text-[10px] font-bold tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
              PLATFORM ADMIN
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="superadmin-sidebar-panel">
        {navSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel className="text-slate-500 dark:text-slate-500">
              {section.title}
            </SidebarGroupLabel>
            <div className="space-y-0.5">
              {section.items.map(({ id, label, icon: Icon, to }) => (
                <SidebarMenuButton
                  key={id}
                  asChild
                  active={activePage === id}
                  className={`superadmin-nav-item ${
                    activePage === id
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/15 ring-1 ring-indigo-700 hover:bg-indigo-700 hover:text-white dark:bg-indigo-400/15 dark:text-indigo-100 dark:shadow-none dark:ring-indigo-300/20 dark:hover:bg-indigo-400/20 dark:hover:text-white"
                      : "text-slate-700 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  }`}
                >
                  <Link to={to}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="sidebar-expanded flex-1">{label}</span>
                  </Link>
                </SidebarMenuButton>
              ))}
            </div>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="superadmin-sidebar-panel border-slate-200/80 dark:border-white/10">
        {signOutError && (
          <p role="alert" className="mb-2 px-2 text-xs text-red-600 dark:text-red-300">
            {signOutError}
          </p>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200/70 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-200/10">
            {userName?.charAt(0)?.toUpperCase() ?? "A"}
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="superadmin-user-name block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
              {userName ?? "Super Admin"}
            </span>
            <span className="superadmin-user-email block truncate text-[10px] text-slate-500 dark:text-slate-400">
              {userEmail ?? "admin@schoolhub.gh"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isSigningOut}
            aria-label={isSigningOut ? "Signing out" : "Sign out"}
            title={isSigningOut ? "Signing out…" : "Sign out"}
            className="superadmin-button-danger flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-200"
          >
            {isSigningOut ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="mt-2 px-2 text-xs text-red-600 dark:text-red-300">
            {signOutError}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
