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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 print:static print:bg-white print:p-0" role="presentation">
      <div id="credentials-print-root" role="dialog" aria-modal="true" aria-labelledby="credentials-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900 print:max-h-none print:border-0 print:shadow-none">
        <h2 id="credentials-title" className="text-lg font-bold text-slate-900 dark:text-white">Login details created</h2>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
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
              <section key={`${credentials.loginEmail}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{entry.label}</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">{credentials.loginId ? "Username" : "Sign in with"}</dt>
                    <dd className="break-all text-right font-mono text-slate-900 dark:text-white">{signIn}</dd>
                  </div>
                  {credentials.loginId && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Login email</dt>
                      <dd className="break-all text-right font-mono text-xs text-slate-600 dark:text-slate-300">{credentials.loginEmail}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Temporary password</dt>
                    <dd className="select-all font-mono font-semibold tracking-wide text-slate-900 dark:text-white">{credentials.temporaryPassword}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => void copy(`${index}`, block)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                  {copied === `${index}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied === `${index}` ? "Copied" : "Copy details"}
                </button>
              </section>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
            <Printer className="size-4" /> Print
          </button>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
            I’ve saved these
          </button>
        </div>
      </div>
    </div>
  );
}
