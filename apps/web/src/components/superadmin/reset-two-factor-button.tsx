import { useMutation } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, ShieldOff, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

interface ResetTwoFactorButtonProps {
  schoolId: string;
  userId: string;
  name: string;
  onDone: () => void;
}

/**
 * Recovery for a school administrator who lost both their phone and backup
 * codes. Removes their second factor and signs them out everywhere; they then
 * sign in with their password and set it up again. Audited server-side.
 */
export function ResetTwoFactorButton({ schoolId, userId, name, onDone }: ResetTwoFactorButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/super-admin/schools/${schoolId}/admins/${userId}/reset-two-factor`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { setOpen(false); onDone(); },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !mutation.isPending) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mutation.isPending]);

  return (
    <>
      <button type="button" onClick={() => { mutation.reset(); setOpen(true); }} className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold">
        <ShieldOff className="size-3.5" /> Reset 2FA
      </button>
      {open && createPortal(
        <div className="superadmin-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !mutation.isPending) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="superadmin-confirm-dialog w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-warning/10 text-warning"><ShieldOff className="size-5" /></span>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} disabled={mutation.isPending} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
            </div>
            <h2 id={titleId} className="mt-4 text-lg font-bold text-foreground">Reset two-factor for {name}?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Only do this after confirming the person’s identity (for example by phone). Their authenticator and backup codes stop working, they are signed out on every device, and they must set up two-factor again. This is recorded in the audit log.
            </p>
            {mutation.error && <p role="alert" className="mt-3 flex items-start gap-2 text-xs font-medium text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{mutation.error.message}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={mutation.isPending} className="superadmin-button-secondary rounded-xl px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="superadmin-button-danger inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
                {mutation.isPending && <LoaderCircle className="size-4 animate-spin" />} Reset two-factor
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
