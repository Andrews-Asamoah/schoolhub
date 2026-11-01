import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { apiFetch, getClientSubdomain } from "@/lib/api";
import {
  RecoveryShell,
  recoveryButton,
  recoveryInput,
} from "@/components/auth/recovery-shell";
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});
function ForgotPasswordPage() {
  const [email, setEmail] = useState(""),
    [pending, setPending] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  const school = getClientSubdomain(),
    suffix = school ? "?school=" + encodeURIComponent(school) : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await apiFetch("/account/password-recovery/request", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          ...(school ? { school } : {}),
        }),
      });
      setSent(true);
      setEmail("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Recovery is unavailable. Try again later or contact your school administrator.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <RecoveryShell
      title="Forgot your password?"
      description="Enter your verified account email. Accounts without a verified email need help from a school administrator."
    >
      {sent ? (
        <div className="space-y-4">
          <p
            role="status"
            className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-foreground"
          >
            If this address belongs to an eligible account, a reset link will
            arrive shortly. Check your inbox and spam folder. Use the most
            recent link within 15 minutes.
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            No email? Your address may be unverified, recovery may be limited,
            or an administrator may need to help. You can request up to three
            links per hour.
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-primary"
            onClick={() => setSent(false)}
          >
            Use another email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Account email
            <input
              className={recoveryInput}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button className={recoveryButton} disabled={pending}>
            {pending ? "Requesting…" : "Send reset link"}
          </button>
        </form>
      )}
      <a
        href={"/login" + suffix}
        className="inline-block text-sm font-semibold text-primary"
      >
        Back to sign in
      </a>
    </RecoveryShell>
  );
}
