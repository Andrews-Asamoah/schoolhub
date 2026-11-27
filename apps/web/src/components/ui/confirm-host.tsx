import { useState, useSyncExternalStore } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ReasonOptions extends ConfirmOptions {
  /** Label for the text box. */
  reasonLabel: string;
  minLength: number;
  maxLength: number;
}

interface Pending extends ConfirmOptions {
  reason?: Pick<ReasonOptions, "reasonLabel" | "minLength" | "maxLength">;
  resolve: (accepted: boolean, reason?: string) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function emit(next: Pending | null) {
  pending = next;
  listeners.forEach((listener) => listener());
}

/**
 * Promise-based replacement for window.confirm(). Resolves true when the user
 * confirms and false when they cancel. Requires <ConfirmHost /> to be mounted once at the root.
 * A second request while one is open cancels the first.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => emit({ ...options, resolve }));
}

/** Like confirmAction, but also collects a written reason. Resolves to the trimmed reason, or null if cancelled. */
export function promptReason(options: ReasonOptions): Promise<string | null> {
  pending?.resolve(false);
  const { reasonLabel, minLength, maxLength, ...rest } = options;
  return new Promise<string | null>((resolve) =>
    emit({ ...rest, reason: { reasonLabel, minLength, maxLength }, resolve: (accepted, reason) => resolve(accepted ? (reason ?? "") : null) }),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function settle(accepted: boolean, reason?: string) {
  const current = pending;
  emit(null);
  current?.resolve(accepted, reason);
}

export function ConfirmHost() {
  const current = useSyncExternalStore(subscribe, () => pending, () => null);
  // Remount the reason box for each new request so an old reason never carries over.
  return <ConfirmHostInner key={current ? current.title + current.description : "closed"} current={current} />;
}

function ConfirmHostInner({ current }: { current: Pending | null }) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const rule = current?.reason;
  const invalid = Boolean(rule) && (trimmed.length < rule!.minLength || trimmed.length > rule!.maxLength);
  return (
    <ConfirmDialog
      open={current !== null}
      title={current?.title ?? ""}
      description={current?.description ?? ""}
      confirmLabel={current?.confirmLabel}
      cancelLabel={current?.cancelLabel}
      confirmVariant={current?.danger ? "danger" : "primary"}
      confirmDisabled={invalid}
      onConfirm={() => settle(true, trimmed)}
      onCancel={() => settle(false)}
    >
      {rule && (
        <label className="mt-4 block text-sm font-medium text-foreground">
          {rule.reasonLabel}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={rule.maxLength}
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">{rule.minLength} to {rule.maxLength} characters ({trimmed.length} entered)</span>
        </label>
      )}
    </ConfirmDialog>
  );
}
