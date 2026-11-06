/** Remove account-specific preferences and recovery drafts, retaining public theme settings. */
export function clearPrivateSessionPreferences() {
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith("schoolhub-draft:") || key.startsWith("schoolhub-ward:") || key === "schoolhub-accountant-academic-view") {
      window.sessionStorage.removeItem(key);
    }
  }
  window.localStorage.removeItem("schoolhub-active-role");
}
