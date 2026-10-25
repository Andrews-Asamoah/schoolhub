import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { TwoFactorPanel } from "@/components/auth/two-factor-panel";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { signOut, useSession } from "@/lib/auth-client";

interface Search {
  audience?: "super-admin" | "school-admin";
}

export const Route = createFileRoute("/two-factor-setup")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    audience: search.audience === "super-admin" ? "super-admin" : search.audience === "school-admin" ? "school-admin" : undefined,
  }),
  component: TwoFactorSetupPage,
});

function TwoFactorSetupPage() {
  const { audience } = Route.useSearch();
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) void navigate({ to: "/login", replace: true });
  }, [session, isPending, navigate]);

  function proceed() {
    void navigate({ to: session?.user?.role === "superAdmin" ? "/admin/dashboard" : "/dashboard", replace: true });
  }

  const isSuperAdmin = audience === "super-admin" || session?.user?.role === "superAdmin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-border bg-card p-7 shadow-xl sm:p-9">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">Secure your account</h1>
          <p className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">
            {isSuperAdmin
              ? "Platform administrators must sign in with two-factor authentication because this account can reach every school. It takes about two minutes."
              : "Your school requires administrators to use two-factor authentication to protect student and financial records. It takes about two minutes."}
          </p>

          {isPending || !session?.user ? null : session.user.twoFactorEnabled ? (
            <div className="space-y-4">
              <p role="status" className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
                Two-factor authentication is on. You’re all set.
              </p>
              <button type="button" onClick={proceed} className="superadmin-button-primary rounded-xl px-4 py-2.5 text-sm font-semibold">Continue</button>
            </div>
          ) : (
            <TwoFactorPanel required onEnabled={proceed} />
          )}

          <button type="button" onClick={() => void signOut().then(() => window.location.assign("/login"))} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
