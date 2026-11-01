import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "@schoolhub/shared";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import {
  RecoveryShell,
  recoveryButton,
  recoveryInput,
} from "@/components/auth/recovery-shell";
export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});
function ResetPasswordPage() {
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const school = getClientSubdomain(),
    suffix = school ? "?school=" + encodeURIComponent(school) : "";
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Password does not meet requirements.",
      );
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await apiFetch("/account/password-recovery/complete", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
      setToken("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Reset failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <RecoveryShell
      title={done ? "Password reset" : "Choose a new password"}
      description={
        done
          ? "Your password has been changed. All existing sessions and trusted-device shortcuts have been revoked. Sign in again to continue."
          : "Use the latest reset link from your email. The link works once and expires 15 minutes after it was requested."
      }
    >
      {done ? (
        <p
          role="status"
          className="rounded-xl border border-border p-4 text-sm text-foreground"
        >
          Your password was reset successfully. Sign in with your new password
          and complete authenticator verification if enabled.
        </p>
      ) : !token ? (
        <p role="alert" className="text-sm leading-6 text-muted-foreground">
          This page needs a reset link. Open the most recent email again, or
          request a new link.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs leading-5 text-muted-foreground">
            Use at least {PASSWORD_MIN_LENGTH} characters, with uppercase and
            lowercase letters and a number.
          </p>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            New password
            <input
              className={recoveryInput}
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Confirm new password
            <input
              className={recoveryInput}
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button className={recoveryButton} disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
      <div className="flex flex-wrap gap-4">
        <a
          href={"/login" + suffix}
          className="text-sm font-semibold text-primary"
        >
          Back to sign in
        </a>
        {!done && (
          <a
            href={"/forgot-password" + suffix}
            className="text-sm font-semibold text-primary"
          >
            Request a new link
          </a>
        )}
      </div>
    </RecoveryShell>
  );
}
