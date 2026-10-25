import { AlertTriangle, Check, Copy, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IssuedCredentials } from "@schoolhub/shared";

export interface CredentialEntry {
  /** Who the login belongs to, e.g. "Ama Mensah (student)". */
  label: string;
  credentials: IssuedCredentials;
}

/**
 * One-time reveal of newly issued logins. The temporary password exists only
 * in this component's props: it is not stored in the query cache, local
 * storage or the URL, and the server cannot show it again (only reset it).
 */
export function CredentialsDialog({
  entries,
  onClose,
}: {
  entries: CredentialEntry[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (entries.length === 0) return null;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable - the values are visible to copy by hand */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 print:static print:bg-card print:p-0" role="presentation">
      <div id="credentials-print-root" role="dialog" aria-modal="true" aria-labelledby="credentials-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl print:max-h-none print:border-0 print:shadow-none">
        <h2 id="credentials-title" className="text-lg font-bold text-foreground">Login details created</h2>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            These are temporary passwords. Share them privately (never in a
            group chat) and only once. The system blocks everything else until
            each person chooses their own password at first sign-in, so have
            them sign in promptly.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {entries.map((entry, index) => {
            const { credentials } = entry;
            const signIn = credentials.loginId ?? credentials.loginEmail;
            const block = `Username: ${signIn}\nLogin email: ${credentials.loginEmail}\nTemporary password: ${credentials.temporaryPassword}`;
            return (
              <section key={`${credentials.loginEmail}-${index}`} className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">{entry.label}</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{credentials.loginId ? "Username" : "Sign in with"}</dt>
                    <dd className="break-all text-right font-mono text-foreground">{signIn}</dd>
                  </div>
                  {credentials.loginId && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Login email</dt>
                      <dd className="break-all text-right font-mono text-xs text-muted-foreground">{credentials.loginEmail}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Temporary password</dt>
                    <dd className="select-all font-mono font-semibold tracking-wide text-foreground">{credentials.temporaryPassword}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => void copy(`${index}`, block)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted/50 print:hidden">
                  {copied === `${index}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied === `${index}` ? "Copied" : "Copy details"}
                </button>
              </section>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground/80 hover:bg-muted/50">
            <Printer className="size-4" /> Print
          </button>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            I’ve saved these
          </button>
        </div>
      </div>
    </div>
  );
}
