import type { Platform } from "../types";
import { resolveTenantSubdomain } from "../../tenant-subdomain-resolution";
import { desktopFetch, DESKTOP_REQUEST_ORIGIN } from "./fetch";

export const DESKTOP_SCHOOL_KEY = "schoolhub-desktop-school";
export const platform: Platform = {
  target: "desktop",
  apiBase: "/api",
  authOrigin: DESKTOP_REQUEST_ORIGIN,
  authOptions: {
    // Browser redirect handlers must never navigate a native window to a remote page.
    disableDefaultFetchPlugins: true,
    fetchOptions: { customFetchImpl: desktopFetch },
  },
  fetch: desktopFetch,
  tenantSubdomain() {
    try {
      const code = window.sessionStorage.getItem(DESKTOP_SCHOOL_KEY);
      return code
        ? resolveTenantSubdomain(
            "localhost",
            `?school=${encodeURIComponent(code)}`,
          )
        : null;
    } catch {
      return null;
    }
  },
};
