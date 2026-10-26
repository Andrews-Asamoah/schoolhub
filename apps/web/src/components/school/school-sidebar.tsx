import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen, ChartNoAxesCombined, GraduationCap, HeartHandshake,
  Megaphone, Settings2, Sparkles, UsersRound, WalletCards, Building2,
  type LucideIcon,
} from "lucide-react";
import { SidebarUserMenu } from "@/components/ui/sidebar-user-menu";
import { getOwnPortalItem, getSchoolNavGroupsForRole } from "@/lib/school-navigation";
import { schoolRoleLabel, useSchoolRole } from "@/components/school/school-role-switcher";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenuButton, SidebarNavSection,
} from "@/components/ui/sidebar";

interface SchoolSidebarProps {
  activePage: string;
  schoolName?: string;
  schoolLogo?: string | null;
  schoolMotto?: string | null;
  userName?: string;
  userEmail?: string;
  userImage?: string | null;
}

const groupIcons: Record<string, LucideIcon> = {
  People: UsersRound,
  Academics: BookOpen,
  Family: HeartHandshake,
  "School operations": Building2,
  Finance: WalletCards,
  Insights: ChartNoAxesCombined,
  Communication: Megaphone,
  Administration: Settings2,
};

export function SchoolSidebar({
  activePage, schoolName, schoolLogo, schoolMotto, userName, userEmail, userImage,
}: SchoolSidebarProps) {
  const { activeRole } = useSchoolRole();
  const navGroups = getSchoolNavGroupsForRole(activeRole ?? undefined);
  const ownPortal = getOwnPortalItem(activeRole ?? undefined);
  const activeSection = navGroups.find(group => group.items.some(item => item.id === activePage))?.label ?? null;
  const [expandedSection, setExpandedSection] = useState<string | null>(activeSection);
  // Route and role changes reveal the appropriate group, without opening multiple accordions.
  useEffect(() => { setExpandedSection(activeSection); }, [activeSection]);

  return (
    <Sidebar className="school-sidebar-shell">
      <SidebarHeader>
        <Link to="/dashboard" aria-label="SchoolHub overview"
          className="flex min-w-0 w-full items-center gap-2.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            {schoolLogo ? <img src={schoolLogo} alt="" className="size-full object-cover" /> : <GraduationCap className="size-5" />}
          </span>
          <span className="sidebar-expanded min-w-0 flex-1">
            <span className="school-brand-title block truncate text-[14px] font-bold tracking-tight text-sidebar-foreground">{schoolName ?? "School Workspace"}</span>
            <span className="block truncate text-[10px] font-medium text-muted-foreground">{schoolMotto ?? "SCHOOL MANAGEMENT"}</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenuButton asChild active={activePage === "dashboard"} tooltip="Overview" className="school-sidebar-nav-item">
            <Link to="/dashboard">
              <GraduationCap className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="sidebar-expanded flex-1">Overview</span>
            </Link>
          </SidebarMenuButton>
          {ownPortal && ownPortal.id !== "student-portal" && ownPortal.id !== "accountant-portal" && (
            <SidebarMenuButton asChild active={activePage === ownPortal.id} tooltip={ownPortal.label} className="school-sidebar-nav-item">
              <Link to="/$page" params={{ page: ownPortal.id }}>
                <ownPortal.icon className="size-[18px] shrink-0" aria-hidden="true" />
                <span className="sidebar-expanded flex-1">{ownPortal.label}</span>
              </Link>
            </SidebarMenuButton>
          )}
        </SidebarGroup>
        {navGroups.map(group => (
          <SidebarNavSection key={group.label}
            id={group.label} label={group.label}
            icon={groupIcons[group.label] ?? Building2}
            active={group.label === activeSection}
            expanded={expandedSection === group.label}
            onToggle={() => setExpandedSection(current => current === group.label ? null : group.label)}
            renderItems={flyout => group.items.map(({ id, label, icon: Icon }) => (
              <SidebarMenuButton key={id} asChild flyout={flyout} active={activePage === id}
                tooltip={label} className="school-sidebar-nav-item">
                <Link to="/$page" params={{ page: id }}>
                  <Icon className="size-[16px] shrink-0" aria-hidden="true" />
                  <span className="sidebar-expanded min-w-0 flex-1 truncate">{label}</span>
                </Link>
              </SidebarMenuButton>
            ))}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="sidebar-expanded mb-2 rounded-lg bg-sidebar-accent/50 p-2.5">
          <div className="mb-1 flex items-center gap-2 text-sidebar-accent-foreground">
            <Sparkles className="size-3.5" />
            <span className="text-xs font-semibold">SchoolHub workspace</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Your school's daily operations, together in one place.</p>
        </div>
        <SidebarUserMenu name={userName ?? "School admin"} email={userEmail} image={userImage}
          roleLabel={schoolRoleLabel(activeRole)}
          profileLink={({ className, onClick, children }) => (
            <Link to="/$page" params={{ page: "profile" }} role="menuitem"
              className={className} onClick={onClick}>{children}</Link>
          )}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
