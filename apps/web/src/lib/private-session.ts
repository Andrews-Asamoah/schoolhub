/** Remove account-specific preferences and recovery drafts, retaining public theme settings. */
export function clearPrivateSessionPreferences() {
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith("schoolhub-draft:") || key.startsWith("schoolhub-ward:") || key === "schoolhub-accountant-academic-view") {
      window.sessionStorage.removeItem(key);
    }
  }
  window.localStorage.removeItem("schoolhub-active-role");
}

/** R1 protection for the existing recovery drafts; Phase 2 must also guard the native outbox. */
export function hasPendingPrivateDrafts(storage: Pick<Storage, "length" | "key" | "getItem"> = window.sessionStorage): boolean {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith("schoolhub-draft:")) continue;
    const text = storage.getItem(key);
    if (!text) continue;
    try {
      const draft = JSON.parse(text) as { at?: unknown; value?: unknown };
      if (typeof draft.at === "number" && Date.now() - draft.at <= 86_400_000 && draft.value &&
          typeof draft.value === "object" && Object.keys(draft.value).length > 0) return true;
    } catch { /* Unreadable/expired drafts cannot be restored by the existing editor. */ }
  }
  return false;
}
