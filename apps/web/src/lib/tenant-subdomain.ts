import { platform } from "@schoolhub/platform";
export { resolveTenantSubdomain } from "./tenant-subdomain-resolution";

export function getTenantSubdomain(): string | null {
  return platform.tenantSubdomain();
}
