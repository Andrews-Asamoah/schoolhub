import { localPreferences, sessionPreferences } from "@/lib/browser-storage";
/** Remove account-specific preferences and recovery drafts, retaining public theme settings. */
export function clearPrivateSessionPreferences() {
  for (const key of sessionPreferences.keys()) {
    if (key.startsWith("schoolhub-draft:") || key.startsWith("schoolhub-ward:") || key === "schoolhub-accountant-academic-view") {
      sessionPreferences.removeItem(key);
    }
  }
  localPreferences.removeItem("schoolhub-active-role");
}
