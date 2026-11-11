import { useState } from "react";
import { authClient } from "../../auth-client";
import { forgetDesktopSession, resumeDesktopSession } from "./session";

export default function DesktopSessionControls({
  school,
  address,
  disabled,
  onResumed,
}: {
  school: string;
  address: string;
  disabled: boolean;
  onResumed: (user: {
    role?: string | null;
    mustChangePassword?: boolean | null;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function run(resume: boolean) {
    if (busy || disabled) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!address.includes("@"))
        throw new Error(
          "Enter your email address to use or forget a saved sign-in.",
        );
      if (resume) {
        const user = await resumeDesktopSession(school, address.trim());
        authClient.$store.notify("$sessionSignal");
        await onResumed(user);
      } else {
        await forgetDesktopSession(school, address.trim());
        setNotice("Saved sign-in removed from this Windows account.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Saved sign-ins require your email address and an internet connection.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={busy || disabled || !address}
          className="text-sm font-semibold text-primary disabled:opacity-50"
        >
          {busy ? "Please wait…" : "Use saved sign-in"}
        </button>
        <button
          type="button"
          onClick={() => void run(false)}
          disabled={busy || disabled || !address}
          className="text-sm text-muted-foreground disabled:opacity-50"
        >
          Forget saved sign-in
        </button>
      </div>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
