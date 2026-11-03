import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";
import { roleGroup } from "@/lib/permissions";
export default function Index() {
  const session = useSession();
  const href =
    session.status === "ready" && session.activeRole
      ? (`/${roleGroup(session.activeRole)}` as Href)
      : session.status === "needsRoleSelection"
        ? ("/(auth)/role" as Href)
        : session.status === "needsPasswordChange"
          ? ("/(auth)/change-password" as Href)
          : session.status === "subscriptionInactive"
            ? ("/(auth)/subscription-inactive" as Href)
            : session.status === "needsTwoFactorSetup"
              ? ("/(auth)/two-factor-setup" as Href)
              : "/login";
  return <Redirect href={href} />;
}
