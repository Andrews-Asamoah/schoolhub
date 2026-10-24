import { Link } from "@tanstack/react-router";
import { GraduationCap, Sparkles } from "lucide-react";
import { SidebarUserMenu } from "@/components/ui/sidebar-user-menu";
import { getOwnPortalItem, getSchoolNavGroupsForRole } from "@/lib/school-navigation";
import { schoolRoleLabel, useSchoolRole } from "@/components/school/school-role-switcher";
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
  schoolLogo?: string | null;
  schoolMotto?: string | null;
  userName?: string;
  userEmail?: string;
  userImage?: string | null;
}

export function SchoolSidebar({
  activePage,
  schoolName,
  schoolLogo,
  schoolMotto,
  userName,
  userEmail,
  userImage,
}: SchoolSidebarProps) {
  const { activeRole } = useSchoolRole();
  const navGroups = getSchoolNavGroupsForRole(activeRole ?? undefined);
  const ownPortal = getOwnPortalItem(activeRole ?? undefined);

  return (
    <Sidebar className="school-sidebar-shell">
      <SidebarHeader>
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm overflow-hidden">
            {schoolLogo ? (
              <img src={schoolLogo} alt={schoolName ?? "School Logo"} className="size-full object-cover" />
            ) : (
              <GraduationCap className="size-5" strokeWidth={2.2} />
            )}
          </span>
          <span className="sidebar-expanded min-w-0">
            <span className="school-brand-title block text-[15px] font-bold tracking-tight text-foreground truncate">
              {schoolName ?? "School Workspace"}
            </span>
            <span className="block text-[10px] font-medium tracking-wide text-muted-foreground truncate">
              {schoolMotto ?? "SCHOOL MANAGEMENT"}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenuButton
            asChild
            active={activePage === "dashboard"}
            tooltip="Overview"
            className="school-sidebar-nav-item"
          >
            <Link to="/dashboard">
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
                <GraduationCap className="size-3.5" />
              </span>
              <span className="sidebar-expanded flex-1">Overview</span>
            </Link>
          </SidebarMenuButton>
          {ownPortal && ownPortal.id !== "student-portal" && (
            <SidebarMenuButton
              asChild
              active={activePage === ownPortal.id}
              className="school-sidebar-nav-item"
            >
              <Link to="/$page" params={{ page: ownPortal.id }}>
                <ownPortal.icon className="size-[18px] shrink-0" />
                <span className="sidebar-expanded flex-1">{ownPortal.label}</span>
              </Link>
            </SidebarMenuButton>
          )}
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
        <div className="sidebar-expanded mb-3 rounded-xl bg-primary/5 p-3">
          <div className="mb-1.5 flex items-center gap-2 text-primary">
            <Sparkles className="size-3.5" />
            <span className="text-xs font-semibold">SchoolHub workspace</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Your school&apos;s daily operations, together in one place.
          </p>
        </div>
        <SidebarUserMenu
          name={userName ?? "School admin"}
          email={userEmail}
          image={userImage}
          roleLabel={schoolRoleLabel(activeRole)}
          profileLink={({ className, onClick, children }) => (
            <Link
              to="/$page"
              params={{ page: "profile" }}
              role="menuitem"
              className={className}
              onClick={onClick}
            >
              {children}
            </Link>
          )}
        />
      </SidebarFooter>
    </Sidebar>
  );
}