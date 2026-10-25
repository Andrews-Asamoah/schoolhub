import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PASSWORD_MIN_LENGTH,
  changePasswordSchema,
  type ChangePasswordInput,
} from "@schoolhub/shared";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { ApiError, apiFetch } from "@/lib/api";
import { authClient, signOut, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

const rules = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v: string) => v.length >= PASSWORD_MIN_LENGTH },
  { label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "A number", test: (v: string) => /[0-9]/.test(v) },
];

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const forced = Boolean(session?.user?.mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) void navigate({ to: "/login", replace: true });
  }, [isPending, session, navigate]);

  const ruleResults = useMemo(
    () => rules.map((rule) => ({ ...rule, ok: rule.test(newPassword) })),
    [newPassword],
  );
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
    } satisfies ChangePasswordInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your password and try again.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/account/change-password", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      // Re-read the session so the "must change" flag is gone before routing.
      await authClient.getSession({ query: { disableCookieCache: true } });
      window.location.assign(session?.user?.role === "superAdmin" ? "/admin/dashboard" : "/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn’t update your password. Check your connection and try again.",
      );
      setSaving(false);
    }
  }

  if (isPending || !session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p role="status" className="text-sm text-slate-500">Checking your session…</p>
      </main>
    );
  }

  const inputClass =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 dark:bg-slate-950">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="w-full max-w-[440px]">
        <div className="mb-7">
          <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            {forced ? "Choose your own password" : "Change password"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {forced
              ? "You signed in with a temporary password. Create a personal one to continue — you’ll use it from now on."
              : "Enter your current password, then choose a new one."}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
          <PasswordField id="current" label={forced ? "Temporary password" : "Current password"} autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} show={show} inputClass={inputClass} />
          <PasswordField id="new" label="New password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} show={show} inputClass={inputClass} />
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" aria-label="Password requirements">
            {ruleResults.map((rule) => (
              <li key={rule.label} className={rule.ok ? "flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400" : "flex items-center gap-1.5 text-slate-500"}>
                {rule.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {rule.label}
              </li>
            ))}
          </ul>
          <PasswordField id="confirm" label="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} show={show} inputClass={inputClass} />
          {mismatch && <p role="alert" className="-mt-3 text-xs text-red-600">Passwords do not match.</p>}

          <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-pressed={show}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {show ? "Hide passwords" : "Show passwords"}
          </button>

          <button
            type="submit"
            disabled={saving || ruleResults.some((r) => !r.ok) || mismatch || !currentPassword || !confirmPassword}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : forced ? "Save and continue" : "Update password"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Other devices are signed out when you save.</span>
          <button type="button" className="font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300" onClick={() => void signOut().then(() => navigate({ to: "/login", replace: true }))}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

function PasswordField({
  id, label, value, onChange, show, autoComplete, inputClass,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  show: boolean; autoComplete: string; inputClass: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <input id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} required />
    </div>
  );
}
