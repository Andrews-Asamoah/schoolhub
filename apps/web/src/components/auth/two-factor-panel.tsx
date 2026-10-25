import { Check, CircleAlert, Copy, Download, KeyRound, LoaderCircle, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Step = "idle" | "password" | "scan" | "done" | "codes-password" | "codes" | "disable";

interface TwoFactorPanelProps {
  /** Mandatory enrolment (changes the wording and hides "turn off"). */
  required?: boolean;
  /** Called after the first code is confirmed and 2FA is active. */
  onEnabled?: () => void;
}

const field =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const primary = "superadmin-button-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60";
const secondary = "superadmin-button-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60";

/** "JBSWY3DP…" -> "JBSW Y3DP …" for typing into an authenticator by hand. */
const groupKey = (key: string) => key.replace(/(.{4})/g, "$1 ").trim();

function messageFrom(error: { message?: string } | null | undefined, fallback: string) {
  return error?.message?.trim() || fallback;
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([`SchoolHub backup codes\nEach code works once. Keep this file somewhere safe and private.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schoolhub-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <p className="text-sm font-bold text-foreground">Save your backup codes</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        If you lose your phone, each of these codes lets you sign in once. They are shown only now. Store them in a password manager or print them.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-card p-3 font-mono text-sm tracking-wider text-foreground" aria-label="Backup codes">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={secondary}>
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className={secondary}><Download className="size-4" /> Download</button>
      </div>
    </div>
  );
}

function PasswordStep({ title, hint, cta, busy, error, onSubmit, onCancel, danger }: {
  title: string; hint: string; cta: string; busy: boolean; error: string | null;
  onSubmit: (password: string) => void; onCancel?: () => void; danger?: boolean;
}) {
  const [password, setPassword] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (password) onSubmit(password);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <input type="password" autoFocus autoComplete="current-password" aria-label="Your password" placeholder="Your current password" value={password} onChange={(event) => setPassword(event.target.value)} className={field} />
      {error && <p role="alert" className="flex items-start gap-2 text-xs font-medium text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !password} className={danger ? "superadmin-button-danger inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60" : primary}>
          {busy && <LoaderCircle className="size-4 animate-spin" />} {cta}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy} className={secondary}>Cancel</button>}
      </div>
    </form>
  );
}

export function TwoFactorPanel({ required = false, onEnabled }: TwoFactorPanelProps) {
  const { data: session, refetch } = useSession();
  const enabled = Boolean(session?.user?.twoFactorEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpURI, setTotpURI] = useState("");
  const [qr, setQr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [code, setCode] = useState("");

  const secret = totpURI ? (new URL(totpURI).searchParams.get("secret") ?? "") : "";

  useEffect(() => {
    if (!totpURI) return setQr("");
    let cancelled = false;
    void QRCode.toDataURL(totpURI, { width: 220, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => { cancelled = true; };
  }, [totpURI]);

  const reset = () => { setStep("idle"); setError(null); setTotpURI(""); setCodes([]); setCode(""); setSavedCodes(false); };

  async function start(password: string) {
    setBusy(true); setError(null);
    const result = await authClient.twoFactor.enable({ password, method: "totp" });
    setBusy(false);
    if (result.error || !result.data || result.data.method !== "totp") {
      return setError(messageFrom(result.error, "That password isn’t right."));
    }
    setTotpURI(result.data.totpURI);
    setCodes(result.data.backupCodes);
    setStep("scan");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    if (result.error) {
      setBusy(false);
      return setError(messageFrom(result.error, "That code didn’t match. Check the time on your phone and try the newest code."));
    }
    await refetch();
    setBusy(false);
    setTotpURI(""); setCode("");
    setStep("done");
    onEnabled?.();
  }

  async function regenerate(password: string) {
    setBusy(true); setError(null);
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (result.error || !result.data) return setError(messageFrom(result.error, "That password isn’t right."));
    setCodes(result.data.backupCodes);
    setStep("codes");
  }

  async function disable(password: string) {
    setBusy(true); setError(null);
    const result = await authClient.twoFactor.disable({ password });
    if (result.error) {
      setBusy(false);
      return setError(messageFrom(result.error, "That password isn’t right."));
    }
    await refetch();
    setBusy(false);
    reset();
  }

  let body: ReactNode;
  if (step === "password") {
    body = <PasswordStep title="Confirm it’s you" hint="Enter your password to start setting up two-factor authentication." cta="Continue" busy={busy} error={error} onSubmit={(p) => void start(p)} onCancel={reset} />;
  } else if (step === "scan") {
    body = (
      <div className="space-y-5">
        <ol className="space-y-5">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Scan with an authenticator app</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Use Google Authenticator, Microsoft Authenticator, Authy or 1Password.</p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {/* A QR code must stay dark-on-white in both themes or phones cannot scan it. */}
                <div className="flex size-[236px] items-center justify-center rounded-2xl border border-border bg-card p-2"> {/* theme-allow: QR contrast */}
                  {qr ? <img src={qr} alt="QR code for your authenticator app" width={220} height={220} /> : <LoaderCircle className="size-5 animate-spin text-muted-foreground" />}
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p>Can’t scan? Enter this key instead:</p>
                  <code className="mt-1.5 block break-all rounded-lg bg-muted px-3 py-2 font-mono text-[13px] tracking-wide text-foreground select-all">{groupKey(secret)}</code>
                </div>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
            <div className="min-w-0 flex-1"><BackupCodes codes={codes} /></div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            <form onSubmit={(event) => void confirm(event)} className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-sm font-bold text-foreground">Enter the 6-digit code to finish</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Two-factor authentication turns on only after a correct code.</p>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)} className="mt-0.5 size-4 rounded border-input accent-primary" />
                I’ve saved my backup codes somewhere safe.
              </label>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} aria-label="6-digit code" placeholder="000 000" value={code} onChange={(event) => setCode(event.target.value)} className={cn(field, "max-w-[11rem] text-center font-mono text-lg tracking-[0.3em]")} />
              {error && <p role="alert" className="flex items-start gap-2 text-xs font-medium text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !savedCodes || code.replace(/\s/g, "").length !== 6} className={primary}>
                  {busy && <LoaderCircle className="size-4 animate-spin" />} Turn on
                </button>
                {!required && <button type="button" onClick={reset} disabled={busy} className={secondary}>Cancel</button>}
              </div>
            </form>
          </li>
        </ol>
      </div>
    );
  } else if (step === "codes-password") {
    body = <PasswordStep title="Generate new backup codes" hint="Your old codes stop working as soon as you do this." cta="Generate" busy={busy} error={error} onSubmit={(p) => void regenerate(p)} onCancel={reset} />;
  } else if (step === "codes") {
    body = (<div className="space-y-3"><BackupCodes codes={codes} /><button type="button" onClick={reset} className={primary}>Done</button></div>);
  } else if (step === "disable") {
    body = <PasswordStep danger title="Turn off two-factor authentication?" hint={required ? "You’ll be asked to set it up again straight away, because it’s required for your account." : "Your account will be protected by your password alone."} cta="Turn off" busy={busy} error={error} onSubmit={(p) => void disable(p)} onCancel={reset} />;
  } else if (enabled || step === "done") {
    body = (
      <div className="space-y-4">
        <p role="status" className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span><strong>Two-factor authentication is on.</strong> Signing in needs your password and a code from your authenticator app.</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setError(null); setStep("codes-password"); }} className={secondary}><KeyRound className="size-4" /> New backup codes</button>
          <button type="button" onClick={() => { setError(null); setStep("disable"); }} className={secondary}><ShieldOff className="size-4" /> Turn off</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Smartphone className="mt-0.5 size-4 shrink-0" />
          Add a second step to signing in: a 6-digit code from an app on your phone. Even if your password is stolen, no one can get in without your phone.
        </p>
        <button type="button" onClick={() => { setError(null); setStep("password"); }} className={primary}><ShieldCheck className="size-4" /> Set up two-factor authentication</button>
      </div>
    );
  }

  return <div>{body}</div>;
}
