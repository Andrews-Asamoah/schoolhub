import type { Platform } from "./types";
import { resolveTenantSubdomain } from "../tenant-subdomain-resolution";

/** Browser behavior is preserved; native code is selected only by the desktop build. */
export const platform: Platform = {
  target: "web",
  apiBase: import.meta.env.VITE_API_URL ?? "/api",
  get authOrigin() {
    return window.location.origin;
  },
  authOptions: {},
  fetch: (input, init) => globalThis.fetch(input, init),
  tenantSubdomain: () =>
    typeof window === "undefined"
      ? null
      : resolveTenantSubdomain(
          window.location.hostname,
          window.location.search,
        ),
};
