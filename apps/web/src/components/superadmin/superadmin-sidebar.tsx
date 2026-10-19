import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  School,
  Shield,
  Users,
  CreditCard,
  UserCircle,
  LifeBuoy,
} from "lucide-react";
import { SidebarUserMenu } from "@/components/ui/sidebar-user-menu";
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
        <SidebarUserMenu
          name={userName ?? "Super Admin"}
          email={userEmail ?? "admin@schoolhub.gh"}
          roleLabel="Platform admin"
          profileLink={({ className, onClick, children }) => (
            <Link to="/admin/profile" role="menuitem" className={className} onClick={onClick}>
              {children}
            </Link>
          )}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
