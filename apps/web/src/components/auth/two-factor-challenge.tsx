import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface SignedInUser {
  role?: string | null;
  mustChangePassword?: boolean | null;
}

interface TwoFactorChallengeProps {
  onVerified: (user: SignedInUser | undefined) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Second step of sign-in. The password has already been accepted, but the
 * server withholds the session until a valid code (or backup code) arrives.
 */
export function TwoFactorChallenge({ onVerified, onCancel }: TwoFactorChallengeProps) {
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleaned = code.replace(/[\s-]/g, "");
  const ready = useBackup ? cleaned.length >= 8 : cleaned.length === 6;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code: cleaned })
        : await authClient.twoFactor.verifyTotp({ code: cleaned });
      if (result.error) {
        const tooMany = result.error.status === 429;
        setError(
          tooMany
            ? "Too many attempts. Wait a few minutes before trying again."
            : result.error.message || (useBackup ? "That backup code isn’t valid or was already used." : "That code isn’t right. Try the newest code."),
        );
        setCode("");
        inputRef.current?.focus();
        return;
      }
      await onVerified(result.data?.user as SignedInUser | undefined);
    } catch {
      setError("We couldn’t connect. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onCancel} disabled={busy} className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </button>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {useBackup ? <KeyRound className="size-6" /> : <ShieldCheck className="size-6" />}
      </span>
      <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
        {useBackup ? "Use a backup code" : "Two-step verification"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {useBackup
          ? "Enter one of the backup codes you saved when you set up two-factor authentication. Each code works once."
          : "Open your authenticator app and enter the 6-digit code for SchoolHub."}
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="two-factor-code" className="sr-only">{useBackup ? "Backup code" : "6-digit code"}</label>
          <input
            id="two-factor-code"
            ref={inputRef}
            autoFocus
            required
            inputMode={useBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={useBackup ? 16 : 7}
            placeholder={useBackup ? "xxxxx-xxxxx" : "000 000"}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "two-factor-error" : undefined}
            className={cn(
              "h-14 w-full rounded-xl border bg-card text-center font-mono text-xl text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring/20",
              useBackup ? "tracking-[0.15em]" : "tracking-[0.4em]",
              error ? "border-destructive" : "border-input",
            )}
          />
        </div>
        {error && (
          <p id="two-factor-error" role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        <button type="submit" disabled={!ready || busy} className="superadmin-button-primary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-60">
          {busy && <LoaderCircle className="size-4 animate-spin" />} {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { setUseBackup((value) => !value); setCode(""); setError(null); inputRef.current?.focus(); }}
        className="mt-5 text-sm font-semibold text-primary hover:underline"
      >
        {useBackup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
      </button>
    </div>
  );
}
