import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { consumeLogoutNotice } from "@/hooks/use-logout";
import { authClient, signIn, useSession } from "@/lib/auth-client";
import { useTenantSchool } from "@/lib/tenant";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const chartBars = [42, 58, 49, 75, 63, 88, 70, 96, 77, 100, 84, 91];

function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionPending || !session?.user) return;

    if (session.user.role === "superAdmin") {
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div role="status" className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
          {sessionPending ? "Checking your session…" : "Redirecting to your dashboard…"}
        </div>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Check your details and try again.");
        return;
      }

      if (result.data?.user?.role === "superAdmin") {
        await navigate({ to: "/admin/dashboard", replace: true });
      } else {
        await navigate({ to: "/dashboard", replace: true });
      }
    } catch {
      setError("We couldn’t connect. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.04fr_0.96fr] dark:bg-slate-950">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#101d48] px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, #4169e1 0, transparent 28%), radial-gradient(circle at 90% 80%, #0ea5e9 0, transparent 28%)",
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

        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <GraduationCap className="size-6 text-sky-200" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">
              SchoolHub
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-200/70">
              School management
            </span>
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-blue-100 shadow-lg shadow-blue-950/10 backdrop-blur">
            <Sparkles className="size-3.5 text-sky-300" />
            One connected school community
          </div>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-[-0.04em] xl:text-[54px]">
            A brighter way to{" "}
            <span className="bg-gradient-to-r from-sky-200 via-blue-200 to-indigo-200 bg-clip-text text-transparent">
              run your school.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-blue-100/70">
            Bring your people, learning, and day-to-day operations together in
            one calm, clear workspace.
          </p>

          <div className="mt-12 max-w-md rounded-2xl border border-white/15 bg-white/[0.08] p-5 shadow-2xl shadow-blue-950/30 backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-blue-100/65">
                  School overview
                </p>
                <p className="mt-1 text-lg font-semibold">A clearer picture</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-xl bg-sky-300/15 text-sky-200">
                <ShieldCheck className="size-[18px]" />
              </span>
            </div>
            <div className="mt-6 flex h-[88px] items-end gap-2">
              {chartBars.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-400/30 to-sky-200/90"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-blue-100/60">
              <span>People</span>
              <span>Academics</span>
              <span>Operations</span>
              <span>Finance</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-blue-100/50">
          <span>Thoughtfully made for school communities</span>
          <span>© {new Date().getFullYear()} SchoolHub</span>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-28 size-[440px] rounded-full border border-white/[0.08]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-[320px] rounded-full border border-white/[0.08]"
        />
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <GraduationCap className="size-5" />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight text-slate-900 dark:text-white">
                SchoolHub
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                School management
              </span>
            </span>
          </div>

          <div className="mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Welcome back
            </p>
            <h2 className="text-3xl font-bold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-[34px]">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Enter your account details to continue to SchoolHub.
            </p>
          </div>

          {logoutNotice && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              <ShieldCheck className="size-4 shrink-0" />
              {logoutNotice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Email address
              </label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-600" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@school.edu"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-slate-600"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Password
                </label>
              </div>
              <div className="group relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-600" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-slate-600"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="size-[17px]" />
                  ) : (
                    <Eye className="size-[17px]" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "Signing you in…" : "Sign in"}
              {!loading && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>

          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <LockKeyhole className="size-3.5" />
            <span>Your school workspace is protected and secure.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
