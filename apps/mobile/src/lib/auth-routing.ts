import type { SessionState } from "./session-core";
import { roleGroup } from "./permissions";
export function authDestination(s: SessionState): string {
  if (s.status === "ready" && s.activeRole)
    return `/${roleGroup(s.activeRole)}`;
  if (s.status === "signedOut")
    return s.subdomain ? "/(auth)/login" : "/(auth)/school";
  const steps = {
    loading: "loading",
    needsTwoFactor: "two-factor",
    needsPasswordChange: "change-password",
    needsTwoFactorSetup: "two-factor-setup",
    subscriptionInactive: "subscription-inactive",
    needsRoleSelection: "role-selection",
    ready: "school",
  } as const;
  return `/(auth)/${steps[s.status]}`;
}
