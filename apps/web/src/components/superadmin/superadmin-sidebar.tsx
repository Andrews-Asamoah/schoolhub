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
    <Sidebar className="superadmin-sidebar-shell border-r border-r border-border shadow-sm">
      <SidebarHeader className="superadmin-sidebar-panel border-b border-border">
        <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Shield className="size-5" strokeWidth={2} />
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="superadmin-brand-title block text-[15px] font-bold tracking-tight">
              SchoolHub
            </span>
            <span className="block text-[10px] font-bold tracking-[0.14em] text-primary">
              PLATFORM ADMIN
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="superadmin-sidebar-panel">
        {navSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel className="text-muted-foreground">
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
                      ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20 hover:bg-primary/90"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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

      <SidebarFooter className="superadmin-sidebar-panel border-border">
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
