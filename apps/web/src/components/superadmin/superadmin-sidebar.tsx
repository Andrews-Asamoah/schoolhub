import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, School, Shield, ShieldCheck, Users, CreditCard,
  UserCircle, LifeBuoy, ScrollText, type LucideIcon,
} from "lucide-react";
import { SidebarUserMenu } from "@/components/ui/sidebar-user-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenuButton, SidebarNavSection,
} from "@/components/ui/sidebar";

interface SuperAdminSidebarProps {
  activePage: string;
  userName?: string;
  userEmail?: string;
}

const navSections: Array<{
  title: string; icon: LucideIcon;
  items: Array<{ id: string; label: string; icon: LucideIcon; to:
    "/admin/dashboard" | "/admin/schools" | "/admin/users" |
    "/admin/subscriptions" | "/admin/support" | "/admin/audit" | "/admin/profile" }>;
}> = [
  { title: "Platform management", icon: School, items: [
    { id: "schools", label: "Schools directory", icon: School, to: "/admin/schools" },
    { id: "users", label: "System users", icon: Users, to: "/admin/users" },
    { id: "subscriptions", label: "Subscriptions", icon: CreditCard, to: "/admin/subscriptions" },
    { id: "support", label: "Support desk", icon: LifeBuoy, to: "/admin/support" },
  ] },
  { title: "Security", icon: ShieldCheck, items: [
    { id: "audit", label: "Audit log", icon: ScrollText, to: "/admin/audit" },
  ] },
  { title: "Personal", icon: UserCircle, items: [
    { id: "profile", label: "Account & security", icon: UserCircle, to: "/admin/profile" },
  ] },
];

export function SuperAdminSidebar({ activePage, userName, userEmail }: SuperAdminSidebarProps) {
  const activeSection = navSections.find(group => group.items.some(item => item.id === activePage))?.title ?? null;
  const [expandedSection, setExpandedSection] = useState<string | null>(activeSection);
  useEffect(() => { setExpandedSection(activeSection); }, [activeSection]);

  return (
    <Sidebar className="superadmin-sidebar-shell border-r border-sidebar-border">
      <SidebarHeader className="superadmin-sidebar-panel">
        <Link to="/admin/dashboard" aria-label="SchoolHub platform dashboard"
          className="flex min-w-0 w-full items-center gap-2.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Shield className="size-5" strokeWidth={2} />
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="superadmin-brand-title block truncate text-[14px] font-bold tracking-tight">SchoolHub</span>
            <span className="block text-[10px] font-bold tracking-[0.12em] text-muted-foreground">PLATFORM ADMIN</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="superadmin-sidebar-panel">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenuButton asChild tooltip="Dashboard" active={activePage === "dashboard"} className="superadmin-nav-item">
            <Link to="/admin/dashboard">
              <LayoutDashboard className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="sidebar-expanded min-w-0 flex-1">Dashboard</span>
            </Link>
          </SidebarMenuButton>
        </SidebarGroup>
        {navSections.map(section => (
          <SidebarNavSection key={section.title} id={section.title} label={section.title}
            icon={section.icon} active={section.title === activeSection}
            expanded={expandedSection === section.title}
            onToggle={() => setExpandedSection(current => current === section.title ? null : section.title)}
            renderItems={flyout => section.items.map(({ id, label, icon: Icon, to }) => (
              <SidebarMenuButton key={id} asChild flyout={flyout} tooltip={label}
                active={activePage === id} className="superadmin-nav-item">
                <Link to={to}>
                  <Icon className="size-[16px] shrink-0" aria-hidden="true" />
                  <span className="sidebar-expanded min-w-0 flex-1 truncate">{label}</span>
                </Link>
              </SidebarMenuButton>
            ))}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="superadmin-sidebar-panel">
        <SidebarUserMenu name={userName ?? "Super Admin"} email={userEmail}
          roleLabel="Platform admin"
          profileLink={({ className, onClick, children }) => (
            <Link to="/admin/profile" role="menuitem" className={className} onClick={onClick}>{children}</Link>
          )}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
