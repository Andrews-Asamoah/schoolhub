import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Index route — smart redirect based on session role.
 * superAdmin → /admin/dashboard
 * logged in  → /dashboard
 * no session → /login
 */
export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      void navigate({ to: "/login" });
    } else if (session.user.role === "superAdmin") {
      void navigate({ to: "/admin/dashboard" });
    } else {
      void navigate({ to: "/dashboard" });
    }
  }, [session, isPending, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
        Redirecting…
      </div>
    </div>
  );
}
