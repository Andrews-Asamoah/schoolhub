import { PLATFORM_STAFF_ROLE } from "@schoolhub/shared";
import { AssignedSchools } from "@/components/superadmin/assigned-schools";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { useEffect } from "react";
import { SuperAdminLayout } from "@/components/superadmin/superadmin-layout";

/**
 * Layout route for all /admin/* pages.
 * Redirects to /login if user is not authenticated or not superAdmin.
 * NOTE: We use useEffect+navigate instead of throw redirect() — throwing
 * redirect inside a component body is not valid in TanStack Router and
 * causes "Something went wrong" errors.
 */
export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const staff = session?.user?.role === PLATFORM_STAFF_ROLE;
  const platformAccount = staff || session?.user?.role === "superAdmin";
  const assignedRoute = routerState.location.pathname.replace(/\/$/, "") === "/admin/schools";

  // Bootstrap credentials must be replaced before the portal can render.
  // The API independently blocks business endpoints until the password is changed.
  const needsPasswordChange =
    platformAccount && Boolean(session?.user.mustChangePassword);

  // Platform administrators must use two-factor authentication. This is only
  // the friendly redirect: the API refuses every /super-admin request without it.
  const needsTwoFactor =
    platformAccount && !needsPasswordChange && !session?.user.twoFactorEnabled;

  useEffect(() => {
    if (isPending) return;
    if (!session?.user || !platformAccount) {
      void navigate({ to: "/login", replace: true });
    } else if (needsPasswordChange) {
      void navigate({ to: "/change-password", replace: true });
    } else if (needsTwoFactor) {
      void navigate({ to: "/two-factor-setup", search: { audience: "super-admin" }, replace: true });
    } else if (staff && !assignedRoute) {
      void navigate({ to: "/admin/schools", replace: true });
    }
  }, [session, isPending, navigate, platformAccount, needsPasswordChange, needsTwoFactor, staff, assignedRoute]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Loading…
        </div>
      </div>
    );
  }

  // While navigating away (unauthenticated), render nothing to avoid flash
  if (
    !session?.user ||
    !platformAccount ||
    needsPasswordChange ||
    needsTwoFactor
  ) {
    return null;
  }

  if (staff) return assignedRoute ? <AssignedSchools /> : null;

  // Derive active page from live router location
  const pathname = routerState.location.pathname;
  let activePage = "dashboard";
  if (pathname.includes("/admin/schools")) activePage = "schools";
  else if (pathname.startsWith("/admin/users")) activePage = "users";
  else if (pathname.startsWith("/admin/subscriptions")) activePage = "subscriptions";
  else if (pathname.startsWith("/admin/plans")) activePage = "plans";
  else if (pathname.startsWith("/admin/support")) activePage = "support";
  else if (pathname.startsWith("/admin/student-deletions")) activePage = "student-deletions";
  else if (pathname.startsWith("/admin/audit")) activePage = "audit";
  else if (pathname.startsWith("/admin/profile")) activePage = "profile";
  const breadcrumb = {
    dashboard: "Dashboard",
    schools: "Schools",
    users: "Platform team",
    subscriptions: "Subscriptions",
    plans: "Subscription plans",
    support: "Support desk",
    "student-deletions": "Student deletion requests",
    audit: "Audit log",
    profile: "Account & security",
  }[activePage];

  return (
    <SuperAdminLayout
      activePage={activePage}
      userName={session.user.name}
      userEmail={session.user.email}
      breadcrumb={breadcrumb}
    >
      <Outlet />
    </SuperAdminLayout>
  );
}
