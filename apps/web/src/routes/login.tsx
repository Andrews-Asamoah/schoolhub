import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentLoginEmail } from "@schoolhub/shared";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { consumeLogoutNotice } from "@/hooks/use-logout";
import { signIn, useSession } from "@/lib/auth-client";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const chartBars = [42, 58, 49, 75, 63, 88, 70, 96, 77, 100, 84, 91];

interface PublicSchoolBranding {
  school: {
    name: string;
    logo: string | null;
    motto: string | null;
  };
}

function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const subdomain = getClientSubdomain();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // True once the password was accepted but a second factor is still required.
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  // Fetch school branding dynamically if a tenant subdomain is active
  const { data: tenantData } = useQuery({
    queryKey: ["login-branding", subdomain],
    queryFn: () => apiFetch<PublicSchoolBranding>(`/admissions/public/${subdomain}`),
    enabled: Boolean(subdomain),
    retry: false,
  });

  const school = tenantData?.school;

  useEffect(() => {
    if (sessionPending || !session?.user) return;

    if (session.user.mustChangePassword) {
      void navigate({ to: "/change-password", replace: true });
    } else if (session.user.role === "superAdmin") {
      void navigate({ to: "/admin/dashboard", replace: true });
    } else {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate, session, sessionPending]);

  useEffect(() => {
    if (sessionPending || session?.user) return;
    const notice = consumeLogoutNotice();
    if (notice) setLogoutNotice(notice);
  }, [session, sessionPending]);

  if (sessionPending || session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          {sessionPending ? "Checking your session…" : "Redirecting to your dashboard…"}
        </div>
      </main>
    );
  }

  async function finishSignIn(user: { role?: string | null; mustChangePassword?: boolean | null } | undefined) {
    if (user?.mustChangePassword) {
      await navigate({ to: "/change-password", replace: true });
    } else if (user?.role === "superAdmin") {
      await navigate({ to: "/admin/dashboard", replace: true });
    } else {
      await navigate({ to: "/dashboard", replace: true });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let loginEmail = email.trim();
      if (!loginEmail.includes("@")) {
        const schoolSub = getClientSubdomain();
        if (!schoolSub) {
          setError("Open your school’s SchoolHub address to sign in with a username, or use your email.");
          setLoading(false);
          return;
        }
        const resolved = await apiFetch<{ email: string }>(
          `/schools/public/${schoolSub}/resolve-login`,
          { method: "POST", body: JSON.stringify({ identifier: loginEmail }) },
        ).catch(() => null);
        loginEmail = resolved?.email ?? studentLoginEmail(loginEmail, schoolSub);
      }
      const result = await signIn.email({ email: loginEmail, password });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Check your details and try again.");
        setLoading(false);
        return;
      }

      // The password was right but this account uses two-factor authentication:
      // no session exists yet, so ask for the code instead of navigating.
      if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setNeedsTwoFactor(true);
        setPassword("");
        return;
      }

      await finishSignIn(result.data?.user);
    } catch {
      setError("We couldn’t connect. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.04fr_0.96fr]">
      
      {/* Left Hero Panel with dynamic school motto/branding adaptation */}
      <section className="relative hidden min-h-screen overflow-hidden bg-brand px-12 py-10 text-brand-foreground lg:flex lg:flex-col xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, var(--brand-glow) 0, transparent 28%), radial-gradient(circle at 90% 80%, var(--brand-soft) 0, transparent 28%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(to bottom, black, transparent 80%)",
          }}
        />

        {/* Dynamic Header Brand (Subdomain logo + name) */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-brand-foreground/10 ring-1 ring-brand-foreground/20 backdrop-blur">
            {school?.logo ? (
              <img src={school.logo} alt={school.name} className="size-full object-cover" />
            ) : (
              <GraduationCap className="size-6 text-brand-foreground/80" strokeWidth={2.2} />
            )}
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">
              {school?.name ?? "SchoolHub"}
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-foreground/80">
              {school?.motto ?? "School management"}
            </span>
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-foreground/15 bg-brand-foreground/[0.07] px-3 py-1.5 text-xs font-medium text-brand-foreground/80 shadow-lg shadow-brand/10 backdrop-blur">
            <Sparkles className="size-3.5 text-brand-accent" />
            {school?.name ? `Welcome to ${school.name} Portal` : "One connected school community"}
          </div>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-[-0.04em] xl:text-[54px]">
            A brighter way to{" "}
            <span className="bg-linear-to-r from-brand-accent via-brand-accent to-brand-foreground bg-clip-text text-transparent">
              run your school.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-brand-foreground/80">
            {school?.motto 
              ? `"${school.motto}" — Bringing your people, learning, and operations together in one clear workspace.` 
              : "Bring your people, learning, and day-to-day operations together in one calm, clear workspace."}
          </p>

          <div className="mt-12 max-w-md rounded-2xl border border-brand-foreground/15 bg-brand-foreground/8 p-5 shadow-2xl shadow-brand/30 backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-brand-foreground/80">
                  School overview
                </p>
                <p className="mt-1 text-lg font-semibold">A clearer picture</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-accent/20 text-brand-foreground/80">
                <ShieldCheck className="size-4.5" />
              </span>
            </div>
            <div className="mt-6 flex h-22 items-end gap-2">
              {chartBars.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-sm bg-linear-to-t from-brand-soft to-brand-accent"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-brand-foreground/10 pt-4 text-[11px] text-brand-foreground/80">
              <span>People</span>
              <span>Academics</span>
              <span>Operations</span>
              <span>Finance</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-brand-foreground/80">
          <span>Thoughtfully made for school communities</span>
          <span>© {new Date().getFullYear()} SchoolHub</span>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-28 size-110 rounded-full border border-brand-foreground/8"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full border border-brand-foreground/8"
        />
      </section>

      {/* Right Login Form Section */}
      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-105">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              {school?.logo ? (
                <img src={school.logo} alt={school.name} className="size-full object-cover" />
              ) : (
                <GraduationCap className="size-5" />
              )}
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight text-foreground">
                {school?.name ?? "SchoolHub"}
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                {school?.motto ?? "School management"}
              </span>
            </span>
          </div>

          {needsTwoFactor ? (
            <TwoFactorChallenge
              onVerified={finishSignIn}
              allowTrustDevice={!subdomain}
              onCancel={() => { setNeedsTwoFactor(false); setError(null); }}
            />
          ) : (
            <>
          <div className="mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Welcome back
            </p>
            <h2 className="text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-[34px]">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Enter your account details to continue to {school?.name ?? "SchoolHub"}.
            </p>
          </div>

          {logoutNotice && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 flex items-center gap-3 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"
            >
              <ShieldCheck className="size-4 shrink-0" />
              {logoutNotice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-5 text-destructive"
            >
              {error}
            </div>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-semibold text-foreground/80"
              >
                Email or username
              </label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4.25 -translate-y-1/2 text-muted-foreground/70 transition group-focus-within:text-primary" />
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@school.edu or a.asamoah"
                  className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-input focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-foreground/80"
                >
                  Password
                </label>
              </div>
              <div className="group relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4.25 -translate-y-1/2 text-muted-foreground/70 transition group-focus-within:text-primary" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-12 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-input focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showPassword ? (
                    <EyeOff className="size-4.25" />
                  ) : (
                    <Eye className="size-4.25" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "Signing you in…" : "Sign in"}
              {!loading && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>
            </>
          )}

          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/70">
            <LockKeyhole className="size-3.5" />
            <span>Your school workspace is protected and secure.</span>
          </div>
        </div>
      </section>
    </main>
  );
}