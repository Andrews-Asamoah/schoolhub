import { readRecoveryLink } from "@/lib/portal-links";

const listeners = new Set<() => void>();
let pending: { token: string; id: number } | null = null;
let id = 0;
let expiry: ReturnType<typeof setTimeout>;

function notify() {
  listeners.forEach((listener) => listener());
}

export function clearRecoveryLink() {
  clearTimeout(expiry);
  pending = null;
  notify();
}

export function subscribeToRecoveryLink(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecoveryLink() {
  return pending;
}

export function redirectRecoveryLink(path: string): string | null {
  const token = readRecoveryLink(path);
  if (!token) {
    // Strip rejected recovery URLs before they can reach Expo Router.
    return /(?:^|\/)reset-password(?:[/?#]|$)/.test(path) ? null : path;
  }
  clearTimeout(expiry);
  pending = { token, id: ++id };
  expiry = setTimeout(clearRecoveryLink, 15 * 60 * 1000);
  notify();
  return "/password-recovery-link";
}
